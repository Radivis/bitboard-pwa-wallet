use std::collections::HashSet;

use ark_core::server::VirtualTxOutPoint;

use crate::error::ArkResult;
use crate::persistence::{OffchainVtxoSnapshot, VirtualTxOutPointRecord, VtxoExitPhase};

use super::onchain::{
    ExitOnChainProbe, detect_exiting_vtxo_completion_on_esplora, exit_branch_spent_on_chain,
    unroll_branch_visible_on_chain,
};
use crate::outpoint::VirtualOutPoint;
use crate::session::ArkSession;
use crate::session::pending_exit::mark_vtxo_spent_in_snapshot;
use crate::session::unilateral_exit::vtxo_exit::parse_vtxo_exit_record_key;
use bitcoin::{OutPoint, Txid};
use std::str::FromStr;

const WARN_ASP_MISMATCH: &str = "Operator reports this exiting VTXO as swept without unrolled; balance kept until the indexer catches up.";
const WARN_INDEXER_LAG: &str = "Exiting VTXO is missing from the operator list but visible on-chain; waiting for the indexer to catch up.";
const WARN_MISSING_INDEX: &str = "Exiting VTXO is missing from the operator index with no on-chain evidence yet; balance kept until sync confirms.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ExitingVtxoReconcileOutcome {
    Ok,
    ClearSpent,
    ClearOnChainSpent,
    KeepWarnAspMismatch,
    KeepWarnIndexerLag,
    KeepWarnMissingIndex,
}

pub(crate) struct ExitingVtxoReconcileResult {
    pub snapshot: OffchainVtxoSnapshot,
    pub warnings: Vec<String>,
}

pub(crate) fn merge_exiting_vtxo_sync_warnings(warnings: Vec<String>) -> Option<String> {
    if warnings.is_empty() {
        return None;
    }
    let mut deduped = Vec::new();
    let mut seen = HashSet::new();
    for warning in warnings {
        if seen.insert(warning.clone()) {
            deduped.push(warning);
        }
    }
    Some(deduped.join("\n"))
}

pub(crate) fn warning_for_outcome(outcome: ExitingVtxoReconcileOutcome) -> Option<&'static str> {
    match outcome {
        ExitingVtxoReconcileOutcome::Ok
        | ExitingVtxoReconcileOutcome::ClearSpent
        | ExitingVtxoReconcileOutcome::ClearOnChainSpent => None,
        ExitingVtxoReconcileOutcome::KeepWarnAspMismatch => Some(WARN_ASP_MISMATCH),
        ExitingVtxoReconcileOutcome::KeepWarnIndexerLag => Some(WARN_INDEXER_LAG),
        ExitingVtxoReconcileOutcome::KeepWarnMissingIndex => Some(WARN_MISSING_INDEX),
    }
}

pub(crate) fn classify_operator_vtxo(
    virtual_tx_outpoint: &VirtualTxOutPoint,
) -> ExitingVtxoReconcileOutcome {
    if virtual_tx_outpoint.is_unrolled && !virtual_tx_outpoint.is_spent {
        return ExitingVtxoReconcileOutcome::Ok;
    }
    if virtual_tx_outpoint.is_spent {
        return ExitingVtxoReconcileOutcome::ClearSpent;
    }
    if virtual_tx_outpoint.is_swept && !virtual_tx_outpoint.is_unrolled {
        return ExitingVtxoReconcileOutcome::KeepWarnAspMismatch;
    }
    ExitingVtxoReconcileOutcome::Ok
}

/// When a survival record exists for a VTXO the operator still lists as spendable, only force
/// `is_unrolled` if this record is already `unrolled` / `complete_ready`. Tagged records must not
/// classify the VTXO as unrolled (that made the control graph show HandCoins at step 3).
pub(crate) fn record_has_confirmed_unroll(phase: VtxoExitPhase) -> bool {
    matches!(
        phase,
        VtxoExitPhase::Unrolled | VtxoExitPhase::CompleteReady
    )
}

fn apply_record_unroll_stickiness_for_present_spendable(
    snapshot: &mut OffchainVtxoSnapshot,
    txid: &str,
    vout: u32,
    amount_sats: u64,
    phase: VtxoExitPhase,
    prior_record: Option<&VirtualTxOutPointRecord>,
) {
    if !record_has_confirmed_unroll(phase) {
        return;
    }
    reinject_exiting_record(
        snapshot,
        record_for_reinject(prior_record, txid, vout, amount_sats),
    );
}

fn snapshot_record<'a>(
    snapshot: &'a OffchainVtxoSnapshot,
    txid: &str,
    vout: u32,
) -> Option<&'a VirtualTxOutPointRecord> {
    snapshot
        .virtual_tx_outpoints
        .iter()
        .find(|record| record.txid == txid && record.vout == vout)
}

fn snapshot_record_already_spent(snapshot: &OffchainVtxoSnapshot, txid: &str, vout: u32) -> bool {
    snapshot_record(snapshot, txid, vout).is_some_and(|record| record.is_spent)
}

fn record_for_reinject(
    prior_record: Option<&VirtualTxOutPointRecord>,
    txid: &str,
    vout: u32,
    amount_sats: u64,
) -> VirtualTxOutPointRecord {
    if let Some(prior) = prior_record {
        let mut record = prior.clone();
        record.is_unrolled = true;
        record.is_spent = false;
        return record;
    }
    VirtualTxOutPointRecord {
        txid: txid.to_string(),
        vout,
        amount_sats,
        created_at: 0,
        expires_at: i64::MAX,
        script_hex: String::new(),
        is_preconfirmed: false,
        is_swept: false,
        is_unrolled: true,
        is_spent: false,
        spent_by: None,
        commitment_txids: vec![],
        settled_by: None,
        ark_txid: None,
        assets: vec![],
        server_pk_hex: None,
    }
}

fn reinject_exiting_record(snapshot: &mut OffchainVtxoSnapshot, record: VirtualTxOutPointRecord) {
    if let Some(existing) = snapshot
        .virtual_tx_outpoints
        .iter_mut()
        .find(|existing| existing.txid == record.txid && existing.vout == record.vout)
    {
        existing.is_unrolled = true;
        existing.is_spent = false;
        if existing.amount_sats == 0 {
            existing.amount_sats = record.amount_sats;
        }
        return;
    }
    snapshot.virtual_tx_outpoints.push(record);
}

fn clear_exiting_record(snapshot: &mut OffchainVtxoSnapshot, txid: &str, vout: u32) {
    if let Some(existing) = snapshot
        .virtual_tx_outpoints
        .iter_mut()
        .find(|record| record.txid == txid && record.vout == vout)
    {
        existing.is_spent = true;
    }
}

/// Mark locally completed unilateral exits when Esplora shows the on-chain spend, even if the
/// operator indexer still treats them as exiting.
pub(crate) async fn reconcile_exiting_vtxos_spent_on_esplora(
    session: &ArkSession,
    snapshot: &mut OffchainVtxoSnapshot,
) -> ArkResult<Vec<OutPoint>> {
    let blockchain = session.client.blockchain();
    let records = session.wallet_db.vtxo_exit_records();

    let mut probe_targets: Vec<(String, u32)> = snapshot
        .virtual_tx_outpoints
        .iter()
        .filter(|record| record.is_unrolled && !record.is_spent)
        .map(|record| (record.txid.clone(), record.vout))
        .collect();

    for (key, record) in &records {
        if !record_has_confirmed_unroll(record.phase) && record.phase != VtxoExitPhase::Unrolled {
            continue;
        }
        let Some((txid, vout)) = parse_vtxo_exit_record_key(key) else {
            continue;
        };
        if snapshot_record_already_spent(snapshot, &txid, vout) {
            continue;
        }
        let target = (txid, vout);
        if !probe_targets.iter().any(|existing| existing == &target) {
            probe_targets.push(target);
        }
    }

    let mut healed_outpoints = Vec::new();
    for (leaf_txid, vout) in probe_targets {
        let Some(spend_txid) =
            detect_exiting_vtxo_completion_on_esplora(blockchain, snapshot, &leaf_txid, vout)
                .await?
        else {
            continue;
        };

        mark_vtxo_spent_in_snapshot(snapshot, &leaf_txid, vout, &spend_txid.to_string());
        if let Ok(txid) = Txid::from_str(&leaf_txid) {
            healed_outpoints.push(OutPoint { txid, vout });
        }
    }

    Ok(healed_outpoints)
}

pub(crate) async fn reconcile_exiting_vtxo_watches(
    session: &ArkSession,
    mut snapshot: OffchainVtxoSnapshot,
    prior_snapshot: Option<&OffchainVtxoSnapshot>,
) -> ArkResult<ExitingVtxoReconcileResult> {
    let records = session.wallet_db.vtxo_exit_records();
    let mut warnings = Vec::new();

    for (key, exit_record) in &records {
        if !record_has_confirmed_unroll(exit_record.phase) {
            continue;
        }
        let Some((txid, vout)) = parse_vtxo_exit_record_key(key) else {
            continue;
        };
        let prior_record = prior_snapshot.and_then(|prior| snapshot_record(prior, &txid, vout));
        let survival_probe = ExitOnChainProbe {
            vtxo_txid: txid.clone(),
            vout,
            published_vtxo_txid: Some(exit_record.host_txid.clone()),
            branch_txids:
                crate::session::unilateral_exit::vtxo_exit::materials_chain_txid_strings_for_host(
                    &snapshot,
                    &exit_record.host_txid,
                ),
        };

        let outcome = if let Some(record) = snapshot_record(&snapshot, &txid, vout) {
            if record.is_unrolled && !record.is_spent {
                if exit_branch_spent_on_chain(
                    session.client.blockchain(),
                    &snapshot,
                    &survival_probe,
                )
                .await?
                {
                    ExitingVtxoReconcileOutcome::ClearOnChainSpent
                } else {
                    ExitingVtxoReconcileOutcome::Ok
                }
            } else if record.is_spent {
                ExitingVtxoReconcileOutcome::ClearSpent
            } else if record.is_swept && !record.is_unrolled {
                ExitingVtxoReconcileOutcome::KeepWarnAspMismatch
            } else if !record.is_unrolled {
                apply_record_unroll_stickiness_for_present_spendable(
                    &mut snapshot,
                    &txid,
                    vout,
                    exit_record.amount_sats,
                    exit_record.phase,
                    prior_record,
                );
                ExitingVtxoReconcileOutcome::Ok
            } else {
                ExitingVtxoReconcileOutcome::Ok
            }
        } else {
            reconcile_missing_survival(session, &snapshot, &survival_probe, prior_record).await?
        };

        apply_reconcile_outcome(
            &mut snapshot,
            &mut warnings,
            ReconcileOutcomeApply {
                txid: &txid,
                vout,
                amount_sats: exit_record.amount_sats,
                has_confirmed_unroll: record_has_confirmed_unroll(exit_record.phase),
                prior_record,
            },
            outcome,
        );
    }

    Ok(ExitingVtxoReconcileResult { snapshot, warnings })
}

async fn reconcile_missing_survival(
    session: &ArkSession,
    snapshot: &OffchainVtxoSnapshot,
    probe: &ExitOnChainProbe,
    _prior_record: Option<&VirtualTxOutPointRecord>,
) -> ArkResult<ExitingVtxoReconcileOutcome> {
    let outpoint = VirtualOutPoint::parse(&probe.vtxo_txid, probe.vout)?.to_bitcoin_outpoint();
    if let Ok((vtxo_list, _)) = session
        .client
        .list_vtxos_for_outpoints(vec![outpoint])
        .await
        && let Some(virtual_tx_outpoint) = vtxo_list.all().find(|virtual_tx_outpoint| {
            virtual_tx_outpoint.outpoint.txid == outpoint.txid
                && virtual_tx_outpoint.outpoint.vout == outpoint.vout
        })
    {
        return Ok(classify_operator_vtxo(virtual_tx_outpoint));
    }

    let blockchain = session.client.blockchain();
    if exit_branch_spent_on_chain(blockchain, snapshot, probe).await? {
        return Ok(ExitingVtxoReconcileOutcome::ClearOnChainSpent);
    }
    if unroll_branch_visible_on_chain(blockchain, probe).await? {
        return Ok(ExitingVtxoReconcileOutcome::KeepWarnIndexerLag);
    }
    Ok(ExitingVtxoReconcileOutcome::KeepWarnMissingIndex)
}

struct ReconcileOutcomeApply<'a> {
    txid: &'a str,
    vout: u32,
    amount_sats: u64,
    has_confirmed_unroll: bool,
    prior_record: Option<&'a VirtualTxOutPointRecord>,
}

fn apply_reconcile_outcome(
    snapshot: &mut OffchainVtxoSnapshot,
    warnings: &mut Vec<String>,
    target: ReconcileOutcomeApply<'_>,
    outcome: ExitingVtxoReconcileOutcome,
) {
    match outcome {
        ExitingVtxoReconcileOutcome::Ok => {
            if snapshot_record(snapshot, target.txid, target.vout).is_none()
                && target.has_confirmed_unroll
            {
                reinject_exiting_record(
                    snapshot,
                    record_for_reinject(
                        target.prior_record,
                        target.txid,
                        target.vout,
                        target.amount_sats,
                    ),
                );
            }
        }
        ExitingVtxoReconcileOutcome::ClearSpent
        | ExitingVtxoReconcileOutcome::ClearOnChainSpent => {
            clear_exiting_record(snapshot, target.txid, target.vout);
        }
        ExitingVtxoReconcileOutcome::KeepWarnAspMismatch
        | ExitingVtxoReconcileOutcome::KeepWarnIndexerLag
        | ExitingVtxoReconcileOutcome::KeepWarnMissingIndex => {
            reinject_exiting_record(
                snapshot,
                record_for_reinject(
                    target.prior_record,
                    target.txid,
                    target.vout,
                    target.amount_sats,
                ),
            );
            if let Some(warning) = warning_for_outcome(outcome) {
                warnings.push(warning.to_string());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::VirtualTxOutPointRecord;
    use ark_core::server::VirtualTxOutPoint;
    use bitcoin::hashes::Hash;
    use bitcoin::{Amount, OutPoint, ScriptBuf, Txid};

    fn sample_vtp(is_unrolled: bool, is_spent: bool, is_swept: bool) -> VirtualTxOutPoint {
        VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([0x11; 32]), 0),
            created_at: 0,
            expires_at: 9_999_999_999,
            amount: Amount::from_sat(10_000),
            script: ScriptBuf::new(),
            is_preconfirmed: false,
            is_swept,
            is_unrolled,
            is_spent,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        }
    }

    #[test]
    fn classify_operator_vtxo_matches_truth_table() {
        assert_eq!(
            classify_operator_vtxo(&sample_vtp(true, false, false)),
            ExitingVtxoReconcileOutcome::Ok
        );
        assert_eq!(
            classify_operator_vtxo(&sample_vtp(true, true, false)),
            ExitingVtxoReconcileOutcome::ClearSpent
        );
        assert_eq!(
            classify_operator_vtxo(&sample_vtp(false, false, true)),
            ExitingVtxoReconcileOutcome::KeepWarnAspMismatch
        );
    }

    #[test]
    fn merge_exiting_vtxo_sync_warnings_dedupes() {
        let merged = merge_exiting_vtxo_sync_warnings(vec![
            WARN_INDEXER_LAG.to_string(),
            WARN_INDEXER_LAG.to_string(),
        ]);
        assert_eq!(merged.as_deref(), Some(WARN_INDEXER_LAG));
    }

    #[test]
    fn apply_reconcile_keep_warn_reinjects_missing_record() {
        let txid = Txid::from_byte_array([0x22; 32]).to_string();
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![],
            unilateral_exit_materials_by_leaf_tx: std::collections::BTreeMap::new(),
        };
        let mut warnings = Vec::new();

        apply_reconcile_outcome(
            &mut snapshot,
            &mut warnings,
            ReconcileOutcomeApply {
                txid: &txid,
                vout: 0,
                amount_sats: 12_000,
                has_confirmed_unroll: true,
                prior_record: None,
            },
            ExitingVtxoReconcileOutcome::KeepWarnMissingIndex,
        );

        assert_eq!(snapshot.virtual_tx_outpoints.len(), 1);
        assert!(snapshot.virtual_tx_outpoints[0].is_unrolled);
        assert_eq!(warnings.len(), 1);
    }

    #[test]
    fn apply_reconcile_clear_spent_removes_exiting_flag() {
        let txid = Txid::from_byte_array([0x33; 32]).to_string();
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: txid.clone(),
                vout: 0,
                created_at: 0,
                expires_at: 9_999_999_999,
                amount_sats: 12_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: true,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
            }],
            unilateral_exit_materials_by_leaf_tx: std::collections::BTreeMap::new(),
        };
        let mut warnings = Vec::new();

        apply_reconcile_outcome(
            &mut snapshot,
            &mut warnings,
            ReconcileOutcomeApply {
                txid: &txid,
                vout: 0,
                amount_sats: 12_000,
                has_confirmed_unroll: true,
                prior_record: None,
            },
            ExitingVtxoReconcileOutcome::ClearSpent,
        );

        assert!(snapshot.virtual_tx_outpoints[0].is_spent);
    }

    fn spendable_snapshot_record(txid: &str, amount_sats: u64) -> VirtualTxOutPointRecord {
        VirtualTxOutPointRecord {
            txid: txid.to_string(),
            vout: 0,
            created_at: 0,
            expires_at: 9_999_999_999,
            amount_sats,
            script_hex: String::new(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
            server_pk_hex: None,
        }
    }

    #[test]
    fn tagged_record_does_not_stamp_unrolled_on_spendable_snapshot() {
        let txid = Txid::from_byte_array([0x44; 32]).to_string();
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![spendable_snapshot_record(&txid, 12_000)],
            unilateral_exit_materials_by_leaf_tx: std::collections::BTreeMap::new(),
        };

        apply_record_unroll_stickiness_for_present_spendable(
            &mut snapshot,
            &txid,
            0,
            12_000,
            VtxoExitPhase::Tagged,
            None,
        );

        assert!(
            !snapshot.virtual_tx_outpoints[0].is_unrolled,
            "tagged records must not mark VTXOs unrolled"
        );
    }

    #[test]
    fn snapshot_omit_of_unrolled_record_reinjects_without_watch() {
        let txid = Txid::from_byte_array([0x45; 32]).to_string();
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![],
            unilateral_exit_materials_by_leaf_tx: std::collections::BTreeMap::new(),
        };
        let mut warnings = Vec::new();

        apply_reconcile_outcome(
            &mut snapshot,
            &mut warnings,
            ReconcileOutcomeApply {
                txid: &txid,
                vout: 0,
                amount_sats: 12_000,
                has_confirmed_unroll: true,
                prior_record: None,
            },
            ExitingVtxoReconcileOutcome::Ok,
        );

        assert_eq!(snapshot.virtual_tx_outpoints.len(), 1);
        assert!(snapshot.virtual_tx_outpoints[0].is_unrolled);
        assert_eq!(snapshot.virtual_tx_outpoints[0].amount_sats, 12_000);
        assert!(warnings.is_empty());
    }

    #[test]
    fn unrolled_record_stamps_when_operator_still_lists_spendable() {
        let txid = Txid::from_byte_array([0x46; 32]).to_string();
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![spendable_snapshot_record(&txid, 12_000)],
            unilateral_exit_materials_by_leaf_tx: std::collections::BTreeMap::new(),
        };

        apply_record_unroll_stickiness_for_present_spendable(
            &mut snapshot,
            &txid,
            0,
            12_000,
            VtxoExitPhase::Unrolled,
            None,
        );

        assert!(snapshot.virtual_tx_outpoints[0].is_unrolled);
    }
}
