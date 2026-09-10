use std::collections::{BTreeMap, HashMap, HashSet};

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
use crate::persistence::{VirtualTxOutPointRecord, VtxoExitPhase, VtxoExitRecord};
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ClaimabilityStatus {
    can_complete: bool,
    stamped_complete_ready: bool,
}

impl ClaimabilityStatus {
    const ALREADY_COMPLETE_READY: Self = Self {
        can_complete: true,
        stamped_complete_ready: false,
    };
    const NOT_ELIGIBLE: Self = Self {
        can_complete: false,
        stamped_complete_ready: false,
    };
}

fn stamp_complete_ready_when_claimable(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    key: &str,
    can_complete: bool,
) -> ClaimabilityStatus {
    if can_complete && let Some(record) = records.get_mut(key) {
        mark_record_complete_ready(record);
        return ClaimabilityStatus {
            can_complete: true,
            stamped_complete_ready: true,
        };
    }
    ClaimabilityStatus {
        can_complete,
        stamped_complete_ready: false,
    }
}

async fn overlay_complete_ready_if_claimable(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    key: &str,
    phase: VtxoExitPhase,
    eligible_for_probe: bool,
    claimable: impl std::future::Future<Output = ArkResult<bool>>,
) -> ArkResult<ClaimabilityStatus> {
    if phase == VtxoExitPhase::CompleteReady {
        return Ok(ClaimabilityStatus::ALREADY_COMPLETE_READY);
    }
    if !eligible_for_probe {
        return Ok(ClaimabilityStatus::NOT_ELIGIBLE);
    }
    let can_complete = claimable.await?;
    Ok(stamp_complete_ready_when_claimable(
        records,
        key,
        can_complete,
    ))
}

fn pipeline_in_progress_row(
    txid: String,
    vout: u32,
    amount_sats: u64,
    virtual_status_state: VirtualStatusState,
    can_complete: bool,
    tagged_at: i64,
    phase: VtxoExitPhase,
) -> UnilateralExitInProgressDto {
    UnilateralExitInProgressDto {
        id: format!("{txid}:{vout}"),
        txid,
        vout,
        amount_sats,
        virtual_status_state,
        can_complete,
        started_at: Some(tagged_at),
        phase: Some(phase),
    }
}

async fn overlay_in_progress_row_for_record(
    session: &ArkSession,
    records: &mut BTreeMap<String, VtxoExitRecord>,
    key: &str,
    record: &VtxoExitRecord,
    txid: String,
    vout: u32,
    outpoint: UnilateralExitOutpointKey,
    operator_by_outpoint: &HashMap<UnilateralExitOutpointKey, &VirtualTxOutPoint>,
    snapshot_records: &[VirtualTxOutPointRecord],
    operator_script_map: &HashMap<ScriptBuf, Vtxo>,
    offchain_script_map: &HashMap<ScriptBuf, Vtxo>,
    dust: bitcoin::Amount,
) -> ArkResult<(UnilateralExitInProgressDto, bool)> {
    let phase = record.phase;
    if let Some(virtual_tx_outpoint) = operator_by_outpoint.get(&outpoint) {
        let candidate = map_exit_candidate(virtual_tx_outpoint, dust);
        let claimability = overlay_complete_ready_if_claimable(
            records,
            key,
            phase,
            candidate.can_complete || phase == VtxoExitPhase::Unrolled,
            resolve_vtxo_completion_claimable(
                session,
                virtual_tx_outpoint,
                operator_script_map,
                offchain_script_map,
            ),
        )
        .await?;
        return Ok((
            pipeline_in_progress_row(
                candidate.txid,
                candidate.vout,
                candidate.amount_sats,
                candidate.virtual_status_state,
                claimability.can_complete,
                record.tagged_at,
                phase,
            ),
            claimability.stamped_complete_ready,
        ));
    }

    if let Some(snapshot_record) = snapshot_records
        .iter()
        .find(|snapshot_record| snapshot_record.txid == txid && snapshot_record.vout == vout)
    {
        let virtual_status_state = VirtualStatusState::from_spent_and_unrolled(
            snapshot_record.is_spent,
            snapshot_record.is_unrolled,
        );
        let claimability = overlay_complete_ready_if_claimable(
            records,
            key,
            phase,
            snapshot_record_ready_for_completion(snapshot_record),
            async {
                match virtual_tx_outpoint_from_record(snapshot_record) {
                    Ok(virtual_tx_outpoint) => {
                        resolve_vtxo_completion_claimable(
                            session,
                            &virtual_tx_outpoint,
                            operator_script_map,
                            offchain_script_map,
                        )
                        .await
                    }
                    Err(_) => Ok(false),
                }
            },
        )
        .await?;
        return Ok((
            pipeline_in_progress_row(
                txid,
                vout,
                snapshot_record.amount_sats,
                virtual_status_state,
                claimability.can_complete,
                record.tagged_at,
                phase,
            ),
            claimability.stamped_complete_ready,
        ));
    }

    Ok((
        pipeline_in_progress_row(
            txid,
            vout,
            record.amount_sats,
            VirtualStatusState::Unrolled,
            phase == VtxoExitPhase::CompleteReady,
            record.tagged_at,
            phase,
        ),
        false,
    ))
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
            let (row, stamped) = overlay_in_progress_row_for_record(
                self,
                &mut records,
                &key,
                &record,
                txid,
                vout,
                outpoint,
                &operator_by_outpoint,
                snapshot_records,
                &script_pubkey_to_vtxo,
                &offchain_script_map,
                dust,
            )
            .await?;
            stamped_complete_ready |= stamped;
            rows.push(row);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::{VtxoExitRecord, vtxo_exit_record_key};

    fn unrolled_record() -> VtxoExitRecord {
        VtxoExitRecord {
            phase: VtxoExitPhase::Unrolled,
            tagged_at: 1,
            host_txid: "aa".repeat(32),
            amount_sats: 50_000,
        }
    }

    #[test]
    fn overlay_complete_ready_stamps_unrolled_when_claimable() {
        let key = vtxo_exit_record_key(&"aa".repeat(32), 0);
        let mut records = BTreeMap::from([(key.clone(), unrolled_record())]);

        let claimability = stamp_complete_ready_when_claimable(&mut records, &key, true);

        assert!(claimability.can_complete);
        assert!(claimability.stamped_complete_ready);
        assert_eq!(records[&key].phase, VtxoExitPhase::CompleteReady);
    }

    #[test]
    fn overlay_complete_ready_leaves_unrolled_when_not_claimable() {
        let key = vtxo_exit_record_key(&"aa".repeat(32), 0);
        let mut records = BTreeMap::from([(key.clone(), unrolled_record())]);

        let claimability = stamp_complete_ready_when_claimable(&mut records, &key, false);

        assert!(!claimability.can_complete);
        assert!(!claimability.stamped_complete_ready);
        assert_eq!(records[&key].phase, VtxoExitPhase::Unrolled);
    }

    #[test]
    fn pipeline_in_progress_row_uses_outpoint_id() {
        let row = pipeline_in_progress_row(
            "aa".repeat(32),
            1,
            50_000,
            VirtualStatusState::Unrolled,
            true,
            42,
            VtxoExitPhase::CompleteReady,
        );
        assert_eq!(row.id, format!("{}:1", "aa".repeat(32)));
        assert_eq!(row.vout, 1);
        assert!(row.can_complete);
        assert_eq!(row.started_at, Some(42));
        assert_eq!(row.phase, Some(VtxoExitPhase::CompleteReady));
    }
}
