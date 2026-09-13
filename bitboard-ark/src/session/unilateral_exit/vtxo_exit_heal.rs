//! v3 → v12 import heal: leftover pending / snapshot flags → `vtxo_exit_records`.
//!
//! Published 0.3.3 envelopes have no records and no host-tx observations. Intermediate
//! phases (`host_relayed`, …) are not reconstructed.

use std::collections::BTreeMap;

use crate::persistence::{
    OffchainVtxoSnapshot, PendingExitDeductionRecord, PendingExitKind, VtxoExitPhase,
    VtxoExitRecord, vtxo_exit_record_key,
};

fn insert_if_absent(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    txid: &str,
    vout: u32,
    amount_sats: u64,
    phase: VtxoExitPhase,
    now: i64,
) {
    records
        .entry(vtxo_exit_record_key(txid, vout))
        .or_insert(VtxoExitRecord {
            phase,
            tagged_at: now,
            host_txid: txid.to_string(),
            amount_sats,
        });
}

fn snapshot_row_is_spent(snapshot: Option<&OffchainVtxoSnapshot>, txid: &str, vout: u32) -> bool {
    snapshot.is_some_and(|snapshot| {
        snapshot
            .virtual_tx_outpoints
            .iter()
            .any(|row| row.txid == txid && row.vout == vout && row.is_spent)
    })
}

/// Fill empty-pipeline leftovers from a published v3 blob.
///
/// - Snapshot `is_unrolled && !is_spent` → `unrolled` (claimable after upgrade).
/// - Unilateral pending deductions that are not already spent → `tagged` (spend-lock).
///
/// Existing keys are left unchanged (snapshot first, so pending cannot overwrite `unrolled`).
pub fn heal_vtxo_exit_records_from_legacy(
    snapshot: Option<&OffchainVtxoSnapshot>,
    pending: &[PendingExitDeductionRecord],
    records: &mut BTreeMap<String, VtxoExitRecord>,
    now: i64,
) {
    if let Some(snapshot) = snapshot {
        for vtxo in &snapshot.virtual_tx_outpoints {
            if vtxo.is_unrolled && !vtxo.is_spent {
                insert_if_absent(
                    records,
                    &vtxo.txid,
                    vtxo.vout,
                    vtxo.amount_sats,
                    VtxoExitPhase::Unrolled,
                    now,
                );
            }
        }
    }
    for pending_record in pending {
        if pending_record.kind != PendingExitKind::Unilateral {
            continue;
        }
        let Some(txid) = pending_record.vtxo_txid.as_deref() else {
            continue;
        };
        let vout = pending_record.vout.unwrap_or(0);
        if snapshot_row_is_spent(snapshot, txid, vout) {
            continue;
        }
        insert_if_absent(
            records,
            txid,
            vout,
            pending_record.amount_sats,
            VtxoExitPhase::Tagged,
            now,
        );
    }
}
