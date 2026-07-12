use std::collections::HashSet;

use ark_core::server::VirtualTxOutPoint;

use crate::error::ArkResult;
use crate::persistence::{
    OffchainVtxoSnapshot, UnilateralExitWatchRecord, VirtualTxOutPointRecord,
};

use super::ArkSession;
use super::exit_onchain::{exit_branch_spent_on_chain, unroll_branch_visible_on_chain};
use super::exit_watch::backfill_unilateral_exit_watches_if_empty;
use super::mappers::parse_outpoint;

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
    pub watches: Vec<UnilateralExitWatchRecord>,
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

fn record_for_reinject(
    prior_record: Option<&VirtualTxOutPointRecord>,
    watch: &UnilateralExitWatchRecord,
) -> VirtualTxOutPointRecord {
    if let Some(prior) = prior_record {
        let mut record = prior.clone();
        record.is_unrolled = true;
        record.is_spent = false;
        return record;
    }
    VirtualTxOutPointRecord {
        txid: watch.vtxo_txid.clone(),
        vout: watch.vout,
        created_at: 0,
        expires_at: i64::MAX,
        amount_sats: watch.amount_sats,
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
        existing.is_unrolled = false;
    }
}

pub(crate) async fn reconcile_exiting_vtxo_watches(
    session: &ArkSession,
    mut snapshot: OffchainVtxoSnapshot,
    prior_snapshot: Option<&OffchainVtxoSnapshot>,
) -> ArkResult<ExitingVtxoReconcileResult> {
    backfill_unilateral_exit_watches_if_empty(&session.wallet_db);
    let mut watches = session.wallet_db.unilateral_exit_watches();
    let mut warnings = Vec::new();
    let mut retained_watches = Vec::with_capacity(watches.len());

    for watch in watches.drain(..) {
        let txid = watch.vtxo_txid.clone();
        let vout = watch.vout;
        let prior_record = prior_snapshot.and_then(|prior| snapshot_record(prior, &txid, vout));

        let outcome = if let Some(record) = snapshot_record(&snapshot, &txid, vout) {
            if record.is_unrolled && !record.is_spent {
                ExitingVtxoReconcileOutcome::Ok
            } else if record.is_spent {
                ExitingVtxoReconcileOutcome::ClearSpent
            } else if record.is_swept && !record.is_unrolled {
                ExitingVtxoReconcileOutcome::KeepWarnAspMismatch
            } else if !record.is_unrolled {
                reinject_exiting_record(&mut snapshot, record_for_reinject(prior_record, &watch));
                ExitingVtxoReconcileOutcome::Ok
            } else {
                ExitingVtxoReconcileOutcome::Ok
            }
        } else {
            reconcile_missing_watch(session, &watch, prior_record).await?
        };

        apply_reconcile_outcome(
            &mut snapshot,
            &mut retained_watches,
            &mut warnings,
            watch,
            prior_record,
            outcome,
        );
    }

    Ok(ExitingVtxoReconcileResult {
        snapshot,
        warnings,
        watches: retained_watches,
    })
}

async fn reconcile_missing_watch(
    session: &ArkSession,
    watch: &UnilateralExitWatchRecord,
    _prior_record: Option<&VirtualTxOutPointRecord>,
) -> ArkResult<ExitingVtxoReconcileOutcome> {
    let outpoint = parse_outpoint(&watch.vtxo_txid, watch.vout)?;
    if let Ok((vtxo_list, _)) = session
        .client
        .list_vtxos_for_outpoints(vec![outpoint])
        .await
    {
        if let Some(virtual_tx_outpoint) = vtxo_list.all().find(|virtual_tx_outpoint| {
            virtual_tx_outpoint.outpoint.txid == outpoint.txid
                && virtual_tx_outpoint.outpoint.vout == outpoint.vout
        }) {
            return Ok(classify_operator_vtxo(virtual_tx_outpoint));
        }
    }

    let blockchain = session.client.blockchain();
    if exit_branch_spent_on_chain(blockchain, watch).await? {
        return Ok(ExitingVtxoReconcileOutcome::ClearOnChainSpent);
    }
    if unroll_branch_visible_on_chain(blockchain, watch).await? {
        return Ok(ExitingVtxoReconcileOutcome::KeepWarnIndexerLag);
    }
    Ok(ExitingVtxoReconcileOutcome::KeepWarnMissingIndex)
}

fn apply_reconcile_outcome(
    snapshot: &mut OffchainVtxoSnapshot,
    retained_watches: &mut Vec<UnilateralExitWatchRecord>,
    warnings: &mut Vec<String>,
    watch: UnilateralExitWatchRecord,
    prior_record: Option<&VirtualTxOutPointRecord>,
    outcome: ExitingVtxoReconcileOutcome,
) {
    match outcome {
        ExitingVtxoReconcileOutcome::Ok => {
            if snapshot_record(snapshot, &watch.vtxo_txid, watch.vout).is_none() {
                reinject_exiting_record(snapshot, record_for_reinject(prior_record, &watch));
            }
            retained_watches.push(watch);
        }
        ExitingVtxoReconcileOutcome::ClearSpent
        | ExitingVtxoReconcileOutcome::ClearOnChainSpent => {
            clear_exiting_record(snapshot, &watch.vtxo_txid, watch.vout);
        }
        ExitingVtxoReconcileOutcome::KeepWarnAspMismatch
        | ExitingVtxoReconcileOutcome::KeepWarnIndexerLag
        | ExitingVtxoReconcileOutcome::KeepWarnMissingIndex => {
            reinject_exiting_record(snapshot, record_for_reinject(prior_record, &watch));
            if let Some(warning) = warning_for_outcome(outcome) {
                warnings.push(warning.to_string());
            }
            retained_watches.push(watch);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::{UnilateralExitWatchRecord, VirtualTxOutPointRecord};
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
        let watch = UnilateralExitWatchRecord {
            vtxo_txid: Txid::from_byte_array([0x22; 32]).to_string(),
            vout: 0,
            amount_sats: 12_000,
            registered_at: 1,
            published_vtxo_txid: None,
            branch_txids: vec![],
        };
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![],
        };
        let mut retained = Vec::new();
        let mut warnings = Vec::new();

        apply_reconcile_outcome(
            &mut snapshot,
            &mut retained,
            &mut warnings,
            watch,
            None,
            ExitingVtxoReconcileOutcome::KeepWarnMissingIndex,
        );

        assert_eq!(snapshot.virtual_tx_outpoints.len(), 1);
        assert!(snapshot.virtual_tx_outpoints[0].is_unrolled);
        assert_eq!(retained.len(), 1);
        assert_eq!(warnings.len(), 1);
    }

    #[test]
    fn apply_reconcile_clear_spent_removes_exiting_flag() {
        let txid = Txid::from_byte_array([0x33; 32]).to_string();
        let watch = UnilateralExitWatchRecord {
            vtxo_txid: txid.clone(),
            vout: 0,
            amount_sats: 12_000,
            registered_at: 1,
            published_vtxo_txid: None,
            branch_txids: vec![],
        };
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
        };
        let mut retained = Vec::new();
        let mut warnings = Vec::new();

        apply_reconcile_outcome(
            &mut snapshot,
            &mut retained,
            &mut warnings,
            watch,
            None,
            ExitingVtxoReconcileOutcome::ClearSpent,
        );

        assert!(!snapshot.virtual_tx_outpoints[0].is_unrolled);
        assert!(retained.is_empty());
    }
}
