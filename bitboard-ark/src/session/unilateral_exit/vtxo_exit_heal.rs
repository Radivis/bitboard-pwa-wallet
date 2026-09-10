//! Import heal: leftover pending / v10 watches / snapshot flags → `vtxo_exit_records`.

use std::collections::BTreeMap;

use crate::persistence::{
    HostTxObservationRecord, OffchainVtxoSnapshot, PendingExitDeductionRecord, PendingExitKind,
    UnilateralExitWatchRecord, VtxoExitPhase, VtxoExitRecord, vtxo_exit_record_key,
};
use crate::session::unilateral_exit::progress::{leaf_reached_finality, step_reached_confirmation};

/// Map v9 leftover signals onto a phase. Does not invent `funding_lost`. No observation → `tagged`.
fn phase_from_legacy(
    is_unrolled: bool,
    is_spent: bool,
    observation: Option<&HostTxObservationRecord>,
) -> VtxoExitPhase {
    if is_spent && is_unrolled {
        return VtxoExitPhase::Exited;
    }
    if is_unrolled {
        return VtxoExitPhase::Unrolled;
    }
    let Some(observation) = observation else {
        return VtxoExitPhase::Tagged;
    };
    if leaf_reached_finality(observation.confirmations) {
        VtxoExitPhase::Unrolled
    } else if step_reached_confirmation(observation.confirmations) {
        VtxoExitPhase::HostConfirmed
    } else if observation.relayed {
        VtxoExitPhase::HostRelayed
    } else {
        VtxoExitPhase::HostBroadcastAttempted
    }
}

/// Heal upsert: create the row or raise phase / fill a zero amount. Never downgrades.
fn upsert_healed_record(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    txid: &str,
    vout: u32,
    host_txid: &str,
    amount_sats: u64,
    phase: VtxoExitPhase,
    now: i64,
) {
    let key = vtxo_exit_record_key(txid, vout);
    match records.get_mut(&key) {
        Some(existing) => {
            if phase > existing.phase {
                existing.phase = phase;
            }
            if existing.amount_sats == 0 {
                existing.amount_sats = amount_sats;
            }
        }
        None => {
            records.insert(
                key,
                VtxoExitRecord {
                    phase,
                    tagged_at: now,
                    host_txid: host_txid.to_string(),
                    amount_sats,
                },
            );
        }
    }
}

/// Import heal for v9 and older blobs (empty `vtxo_exit_records`).
///
/// Sources, in order of typical evidence: snapshot `is_unrolled && !is_spent`, exit watches, then
/// leftover unilateral pending deductions. Phase comes from `is_unrolled` plus host observation
/// when present; otherwise `tagged`. Existing rows are only raised, never replaced downward.
pub fn heal_vtxo_exit_records_from_legacy(
    snapshot: Option<&OffchainVtxoSnapshot>,
    pending: &[PendingExitDeductionRecord],
    watches: &[UnilateralExitWatchRecord],
    observations: &BTreeMap<String, HostTxObservationRecord>,
    records: &mut BTreeMap<String, VtxoExitRecord>,
    now: i64,
) {
    if let Some(snapshot) = snapshot {
        for vtxo in &snapshot.virtual_tx_outpoints {
            if vtxo.is_unrolled && !vtxo.is_spent {
                let observation = observations.get(&vtxo.txid);
                upsert_healed_record(
                    records,
                    &vtxo.txid,
                    vtxo.vout,
                    &vtxo.txid,
                    vtxo.amount_sats,
                    phase_from_legacy(true, false, observation),
                    now,
                );
            }
        }
    }
    for watch in watches {
        let observation = observations.get(&watch.vtxo_txid);
        let (is_unrolled, is_spent, amount_sats) = snapshot
            .and_then(|snapshot| {
                snapshot
                    .virtual_tx_outpoints
                    .iter()
                    .find(|row| row.txid == watch.vtxo_txid && row.vout == watch.vout)
                    .map(|row| (row.is_unrolled, row.is_spent, row.amount_sats))
            })
            .unwrap_or((false, false, watch.amount_sats));
        if is_spent && !is_unrolled {
            // Spent without unroll is a cooperative spend, not an exit — do not invent a record.
            continue;
        }
        upsert_healed_record(
            records,
            &watch.vtxo_txid,
            watch.vout,
            &watch.vtxo_txid,
            amount_sats,
            phase_from_legacy(is_unrolled, is_spent, observation),
            now,
        );
    }
    for pending_record in pending {
        if pending_record.kind != PendingExitKind::Unilateral {
            continue;
        }
        let Some(txid) = pending_record.vtxo_txid.as_deref() else {
            continue;
        };
        let vout = pending_record.vout.unwrap_or(0);
        let observation = observations.get(txid);
        let (is_unrolled, is_spent) = snapshot
            .and_then(|snapshot| {
                snapshot
                    .virtual_tx_outpoints
                    .iter()
                    .find(|row| row.txid == txid && row.vout == vout)
                    .map(|row| (row.is_unrolled, row.is_spent))
            })
            .unwrap_or((false, false));
        upsert_healed_record(
            records,
            txid,
            vout,
            txid,
            pending_record.amount_sats,
            phase_from_legacy(is_unrolled, is_spent, observation),
            now,
        );
    }
}
