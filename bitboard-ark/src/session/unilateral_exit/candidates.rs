use std::collections::HashMap;
use std::collections::HashSet;

use ark_client::Blockchain;
use ark_core::server::VirtualTxOutPoint;
use ark_core::{ExplorerUtxo, Vtxo};
use bitcoin::ScriptBuf;

use crate::api_types::{ExitCandidateRow, UnilateralExitInProgressRow, VirtualStatusState};
use crate::error::ArkResult;
use crate::exit_balance::{
    UnilateralExitOutpointKey, exit_outpoint_key, exit_outpoint_key_from_str,
    unilateral_exit_in_progress_outpoints,
};
use crate::offchain_snapshot::virtual_tx_outpoint_from_record;
use crate::persistence::PendingExitDeductionRecord;
use crate::persistence::PendingExitKind;

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
        let wallet_snapshot = self.wallet_db.snapshot();
        let snapshot = wallet_snapshot.offchain_vtxo_snapshot.as_ref();
        let pending = self.wallet_db.pending_exit_deductions();
        let watches = self.wallet_db.unilateral_exit_watches();
        unilateral_exit_in_progress_outpoints(snapshot, &pending, &watches)
    }

    fn pending_unilateral_started_at_by_outpoint(
        pending: &[PendingExitDeductionRecord],
    ) -> HashMap<UnilateralExitOutpointKey, i64> {
        pending
            .iter()
            .filter(|record| record.kind == PendingExitKind::Unilateral)
            .filter_map(|record| {
                let txid = record.vtxo_txid.as_deref()?;
                let vout = record.vout?;
                let outpoint = exit_outpoint_key_from_str(txid, vout)?;
                Some((outpoint, record.started_at))
            })
            .collect()
    }

    fn pending_unilateral_amount_sats(
        pending: &[PendingExitDeductionRecord],
        outpoint: &UnilateralExitOutpointKey,
    ) -> u64 {
        pending
            .iter()
            .find(|record| {
                record.kind == PendingExitKind::Unilateral
                    && record
                        .vtxo_txid
                        .as_deref()
                        .and_then(|txid| exit_outpoint_key_from_str(txid, record.vout?))
                        == Some(*outpoint)
            })
            .map(|record| record.amount_sats)
            .unwrap_or(0)
    }

    pub async fn list_exit_candidates(&self) -> ArkResult<Vec<ExitCandidateRow>> {
        let in_progress = self.unilateral_exit_in_progress_outpoints()?;
        let snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot;
        let rows = autonomous_exit_candidates_from_snapshot(self, &in_progress)?;
        filter_exit_candidates_to_terminal_leaves(snapshot.as_ref(), rows)
    }

    pub async fn list_unilateral_exits_in_progress(
        &self,
    ) -> ArkResult<Vec<UnilateralExitInProgressRow>> {
        let in_progress = self.unilateral_exit_in_progress_outpoints()?;
        if in_progress.is_empty() {
            return Ok(Vec::new());
        }

        let pending = self.wallet_db.pending_exit_deductions();
        let started_at_by_outpoint = Self::pending_unilateral_started_at_by_outpoint(&pending);

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
        let watches = wallet_snapshot.unilateral_exit_watches;

        let mut rows = Vec::with_capacity(in_progress.len());
        for outpoint in in_progress {
            let txid = outpoint.txid.to_string();
            let vout = outpoint.vout;
            if let Some(virtual_tx_outpoint) = operator_by_outpoint.get(&outpoint) {
                let candidate = map_exit_candidate(virtual_tx_outpoint, dust);
                let can_complete = if candidate.can_complete {
                    resolve_vtxo_completion_claimable(
                        self,
                        virtual_tx_outpoint,
                        &script_pubkey_to_vtxo,
                        &offchain_script_map,
                    )
                    .await?
                } else {
                    false
                };
                rows.push(UnilateralExitInProgressRow {
                    id: candidate.id,
                    txid: candidate.txid,
                    vout: candidate.vout,
                    amount_sats: candidate.amount_sats,
                    virtual_status_state: candidate.virtual_status_state,
                    can_complete,
                    started_at: started_at_by_outpoint.get(&outpoint).copied(),
                });
                continue;
            }

            if let Some(record) = snapshot_records
                .iter()
                .find(|record| record.txid == txid && record.vout == vout)
            {
                let virtual_status_state = VirtualStatusState::from_spent_and_unrolled(
                    record.is_spent,
                    record.is_unrolled,
                );
                let can_complete = if snapshot_record_ready_for_completion(record) {
                    match virtual_tx_outpoint_from_record(record) {
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
                    }
                } else {
                    false
                };
                rows.push(UnilateralExitInProgressRow {
                    id: format!("{txid}:{vout}"),
                    txid,
                    vout,
                    amount_sats: record.amount_sats,
                    virtual_status_state,
                    can_complete,
                    started_at: started_at_by_outpoint.get(&outpoint).copied(),
                });
                continue;
            }

            rows.push(UnilateralExitInProgressRow {
                id: format!("{txid}:{vout}"),
                txid: txid.clone(),
                vout,
                amount_sats: watches
                    .iter()
                    .find(|watch| watch.vtxo_txid == txid && watch.vout == vout)
                    .map(|watch| watch.amount_sats)
                    .unwrap_or_else(|| Self::pending_unilateral_amount_sats(&pending, &outpoint)),
                virtual_status_state: VirtualStatusState::Unrolled,
                can_complete: false,
                started_at: started_at_by_outpoint.get(&outpoint).copied(),
            });
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
