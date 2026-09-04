use std::collections::HashMap;
use std::collections::HashSet;

use ark_client::Blockchain;
use ark_core::server::VirtualTxOutPoint;
use ark_core::{ExplorerUtxo, Vtxo};
use bitcoin::ScriptBuf;

use crate::api_types::{ExitCandidateDto, UnilateralExitInProgressDto, VirtualStatusState};
use crate::error::ArkResult;
use crate::exit_balance::{
    UnilateralExitOutpointKey, exit_outpoint_key, exit_outpoint_key_from_str,
};
use crate::offchain_snapshot::virtual_tx_outpoint_from_record;
use crate::persistence::VtxoExitPhase;
use crate::session::unilateral_exit::vtxo_exit::{
    mark_record_complete_ready, parse_vtxo_exit_record_key, unilateral_exit_pipeline_outpoints,
};

use super::snapshot_ops::{
    autonomous_exit_candidates_from_snapshot, autonomous_vtxo_list_and_script_map,
};
use super::topology::filter_exit_candidates_to_terminal_leaves;
use crate::session::ArkSession;
use crate::session::mappers::{map_exit_candidate, wasm_safe_now};

async fn vtxo_claimable_for_unilateral_completion(
    session: &ArkSession,
    vtxo: &Vtxo,
) -> ArkResult<bool> {
    let outpoints = session
        .client
        .blockchain()
        .find_outpoints(vtxo.address())
        .await?;
    let now = wasm_safe_now();
    for explorer_utxo in outpoints {
        let ExplorerUtxo {
            confirmation_blocktime,
            confirmations,
            is_spent: false,
            ..
        } = explorer_utxo
        else {
            continue;
        };
        let confirmation_blocktime = confirmation_blocktime
            .map(std::time::Duration::from_secs)
            .unwrap_or(std::time::Duration::ZERO);
        if vtxo.can_be_claimed_unilaterally_by_owner(now, confirmation_blocktime, confirmations) {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn resolve_vtxo_completion_claimable(
    session: &ArkSession,
    virtual_tx_outpoint: &VirtualTxOutPoint,
    operator_script_map: &HashMap<ScriptBuf, Vtxo>,
    offchain_script_map: &HashMap<ScriptBuf, Vtxo>,
) -> ArkResult<bool> {
    let vtxo = operator_script_map
        .get(&virtual_tx_outpoint.script)
        .or_else(|| offchain_script_map.get(&virtual_tx_outpoint.script));
    let Some(vtxo) = vtxo else {
        return Ok(false);
    };
    vtxo_claimable_for_unilateral_completion(session, vtxo).await
}

fn snapshot_record_ready_for_completion(
    record: &crate::persistence::VirtualTxOutPointRecord,
) -> bool {
    record.is_unrolled && !record.is_spent
}

impl ArkSession {
    pub(crate) fn unilateral_exit_in_progress_outpoints(
        &self,
    ) -> ArkResult<HashSet<UnilateralExitOutpointKey>> {
        Ok(self.pipeline_outpoints())
    }

    pub async fn list_exit_candidates(&self) -> ArkResult<Vec<ExitCandidateDto>> {
        let start_excluded = self.start_list_excluded_outpoints();
        let snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot;
        let rows = autonomous_exit_candidates_from_snapshot(self, &start_excluded)?;
        filter_exit_candidates_to_terminal_leaves(snapshot.as_ref(), rows)
    }

    pub async fn list_unilateral_exits_in_progress(
        &self,
    ) -> ArkResult<Vec<UnilateralExitInProgressDto>> {
        self.reconcile_host_tx_finality().await?;
        let mut records = self.wallet_db.vtxo_exit_records();
        let in_progress = unilateral_exit_pipeline_outpoints(&records);
        if in_progress.is_empty() {
            return Ok(Vec::new());
        }

        let (vtxo_list, script_pubkey_to_vtxo) = autonomous_vtxo_list_and_script_map(self)?;
        let offchain_script_map = self.offchain_script_map().unwrap_or_default();
        let dust = self.client.server_info()?.dust;
        let operator_by_outpoint: HashMap<UnilateralExitOutpointKey, _> = vtxo_list
            .all()
            .map(|virtual_tx_outpoint| {
                (
                    exit_outpoint_key(
                        virtual_tx_outpoint.outpoint.txid,
                        virtual_tx_outpoint.outpoint.vout,
                    ),
                    virtual_tx_outpoint,
                )
            })
            .collect();

        let wallet_snapshot = self.wallet_db.snapshot();
        let snapshot_records = wallet_snapshot
            .offchain_vtxo_snapshot
            .as_ref()
            .map(|snapshot| snapshot.virtual_tx_outpoints.as_slice())
            .unwrap_or(&[]);

        let mut rows = Vec::with_capacity(in_progress.len());
        let mut stamped_complete_ready = false;
        let pipeline_keys: Vec<String> = records
            .iter()
            .filter(|(_, record)| record.phase.is_pipeline())
            .map(|(key, _)| key.clone())
            .collect();
        for key in pipeline_keys {
            let Some(record) = records.get(&key).cloned() else {
                continue;
            };
            let Some((txid, vout)) = parse_vtxo_exit_record_key(&key) else {
                continue;
            };
            let Some(outpoint) = exit_outpoint_key_from_str(&txid, vout) else {
                continue;
            };
            let phase = record.phase;
            if let Some(virtual_tx_outpoint) = operator_by_outpoint.get(&outpoint) {
                let candidate = map_exit_candidate(virtual_tx_outpoint, dust);
                let mut can_complete = phase == VtxoExitPhase::CompleteReady;
                if !can_complete && (candidate.can_complete || phase == VtxoExitPhase::Unrolled) {
                    can_complete = resolve_vtxo_completion_claimable(
                        self,
                        virtual_tx_outpoint,
                        &script_pubkey_to_vtxo,
                        &offchain_script_map,
                    )
                    .await?;
                    if can_complete && let Some(record) = records.get_mut(&key) {
                        mark_record_complete_ready(record);
                        stamped_complete_ready = true;
                    }
                }
                rows.push(UnilateralExitInProgressDto {
                    id: candidate.id,
                    txid: candidate.txid,
                    vout: candidate.vout,
                    amount_sats: candidate.amount_sats,
                    virtual_status_state: candidate.virtual_status_state,
                    can_complete,
                    started_at: Some(record.tagged_at),
                    phase: Some(phase),
                });
                continue;
            }

            if let Some(snapshot_record) = snapshot_records.iter().find(|snapshot_record| {
                snapshot_record.txid == txid && snapshot_record.vout == vout
            }) {
                let virtual_status_state = VirtualStatusState::from_spent_and_unrolled(
                    snapshot_record.is_spent,
                    snapshot_record.is_unrolled,
                );
                let mut can_complete = phase == VtxoExitPhase::CompleteReady;
                if !can_complete && snapshot_record_ready_for_completion(snapshot_record) {
                    can_complete = match virtual_tx_outpoint_from_record(snapshot_record) {
                        Ok(virtual_tx_outpoint) => {
                            resolve_vtxo_completion_claimable(
                                self,
                                &virtual_tx_outpoint,
                                &script_pubkey_to_vtxo,
                                &offchain_script_map,
                            )
                            .await?
                        }
                        Err(_) => false,
                    };
                    if can_complete && let Some(record) = records.get_mut(&key) {
                        mark_record_complete_ready(record);
                        stamped_complete_ready = true;
                    }
                }
                rows.push(UnilateralExitInProgressDto {
                    id: format!("{txid}:{vout}"),
                    txid,
                    vout,
                    amount_sats: snapshot_record.amount_sats,
                    virtual_status_state,
                    can_complete,
                    started_at: Some(record.tagged_at),
                    phase: Some(phase),
                });
                continue;
            }

            rows.push(UnilateralExitInProgressDto {
                id: format!("{txid}:{vout}"),
                txid,
                vout,
                amount_sats: record.amount_sats,
                virtual_status_state: VirtualStatusState::Unrolled,
                can_complete: phase == VtxoExitPhase::CompleteReady,
                started_at: Some(record.tagged_at),
                phase: Some(phase),
            });
        }

        if stamped_complete_ready {
            self.wallet_db.set_vtxo_exit_records(records);
        }

        rows.sort_by(|left, right| {
            left.started_at
                .unwrap_or(i64::MAX)
                .cmp(&right.started_at.unwrap_or(i64::MAX))
                .then_with(|| left.txid.cmp(&right.txid))
                .then_with(|| left.vout.cmp(&right.vout))
        });
        Ok(rows)
    }
}
