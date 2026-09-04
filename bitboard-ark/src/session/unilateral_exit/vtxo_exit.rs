//! Per-outpoint VTXO exit records (`ARK-EXIT-27` / `ARK-EXIT-30`).
//!
//! These records are the durable source of truth for pipeline membership, spend-lock, Start-list
//! exclusion, and abort unlock. Idle is **no row**. Host-tx observations (broadcast / relay /
//! confirmations) live in a separate map keyed by virtual txid and **feed** phase advances here;
//! they are not themselves the spend-lock.
//!
//! Phase order (persisted): `tagged` → `host_broadcast_attempted` → `host_relayed` →
//! `host_confirmed` → `unrolled` → `complete_ready` → `exited`. Never persist `funding_lost`
//! (Stage 3). Never downgrade a higher phase back to `tagged` except the explicit rewinds
//! (`never_seen` → `tagged`; reorg under 1 conf → relayed / attempted).
//!
//! `host_txid` on a record is the virtual tx that **hosts that outpoint** (the VTXO's own txid),
//! not an ancestor unless the outpoint lives on that ancestor.

use std::collections::{BTreeMap, HashSet};

use bitcoin::OutPoint;
#[cfg(test)]
use bitcoin::Txid;

use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::{UnilateralExitOutpointKey, exit_outpoint_key_from_str};
use crate::outpoint::VirtualOutPoint;
use crate::persistence::{
    HostTxObservationRecord, OffchainVtxoSnapshot, PendingExitDeductionRecord, PendingExitKind,
    UnilateralExitWatchRecord, VtxoExitPhase, VtxoExitRecord, vtxo_exit_record_key,
};
use crate::session::unilateral_exit::plan::exit_eligible_records_for_topology_hosts_from_snapshot;
use crate::session::unilateral_exit::topology::{
    merge_topology_nodes_from_chains, virtual_tx_type_hosts_exit_outpoints,
};
use crate::unilateral_exit_materials::{
    require_unilateral_exit_materials_for_leaf_tx, vtxo_amount_sats_from_snapshot,
    vtxo_chains_from_snapshot_materials,
};

/// Parse a persisted map key `"{txid}:{vout}"`. Returns `None` if the suffix is not a `u32`.
pub fn parse_vtxo_exit_record_key(key: &str) -> Option<(String, u32)> {
    let (txid, vout_text) = key.rsplit_once(':')?;
    let vout = vout_text.parse().ok()?;
    Some((txid.to_string(), vout))
}

/// Insert `tagged`, or refresh `host_txid` / `amount_sats` on an existing row. Never lowers phase:
/// a VTXO already at `host_broadcast_attempted` or later stays there (idempotent retag / hydrate).
fn upsert_tagged_record(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    txid: &str,
    vout: u32,
    host_txid: &str,
    amount_sats: u64,
    now: i64,
) {
    let key = vtxo_exit_record_key(txid, vout);
    match records.get_mut(&key) {
        Some(existing) => {
            if existing.phase < VtxoExitPhase::Tagged {
                existing.phase = VtxoExitPhase::Tagged;
            }
            existing.host_txid = host_txid.to_string();
            existing.amount_sats = amount_sats;
        }
        None => {
            records.insert(
                key,
                VtxoExitRecord {
                    phase: VtxoExitPhase::Tagged,
                    tagged_at: now,
                    host_txid: host_txid.to_string(),
                    amount_sats,
                },
            );
        }
    }
}

/// Snapshot amount for a VTXO, or `0` if that outpoint is missing (should not happen for a tagged leaf).
fn amount_for_outpoint(snapshot: &OffchainVtxoSnapshot, txid: &str, vout: u32) -> u64 {
    vtxo_amount_sats_from_snapshot(Some(snapshot), txid, vout).unwrap_or(0)
}

/// Tag every exit-relevant outpoint for the selected leaves (`ARK-EXIT-30`).
///
/// That set is the selected leaf outpoints **plus** exit-eligible `tree` / `ark` hosts on the
/// materials DAG (en-passant siblings and intermediate hosts). Commitment / checkpoint txs are
/// not tagged. Fails with `autonomous_exit_materials_missing` if a selected leaf has no materials.
/// Existing higher phases are left unchanged.
pub fn tag_unilateral_exit_plan_in_records(
    snapshot: &OffchainVtxoSnapshot,
    selected_leaves: &[VirtualOutPoint],
    records: &mut BTreeMap<String, VtxoExitRecord>,
    now: i64,
) -> ArkResult<()> {
    if selected_leaves.is_empty() {
        return Err(ArkWasmError::EmptyVtxoOutpoints);
    }
    let mut chain_sets = Vec::new();
    for leaf in selected_leaves {
        let leaf_txid = leaf.txid.to_string();
        require_unilateral_exit_materials_for_leaf_tx(snapshot, &leaf_txid)?;
        chain_sets.push(vtxo_chains_from_snapshot_materials(snapshot, &leaf_txid)?);
    }
    let nodes = merge_topology_nodes_from_chains(chain_sets.iter());
    let host_txids: HashSet<String> = nodes
        .iter()
        .filter(|node| virtual_tx_type_hosts_exit_outpoints(&node.tx_type))
        .map(|node| node.txid.clone())
        .collect();
    let host_records =
        exit_eligible_records_for_topology_hosts_from_snapshot(Some(snapshot), &host_txids);

    // Selected leaves first (the user's chosen vouts), then every exit-eligible outpoint on
    // intermediate tree/ark hosts — those are the en-passant siblings that unroll with the leaf.
    let mut seen = HashSet::new();
    for leaf in selected_leaves {
        let txid = leaf.txid.to_string();
        if seen.insert((txid.clone(), leaf.vout)) {
            let amount_sats = amount_for_outpoint(snapshot, &txid, leaf.vout);
            upsert_tagged_record(records, &txid, leaf.vout, &txid, amount_sats, now);
        }
    }
    for host_record in host_records {
        if seen.insert((host_record.txid.clone(), host_record.vout)) {
            upsert_tagged_record(
                records,
                &host_record.txid,
                host_record.vout,
                &host_record.txid,
                host_record.amount_sats,
                now,
            );
        }
    }
    Ok(())
}

/// Outpoints this plan would tag, without writing the caller's record map.
///
/// Used by abort to decide which rows are in-scope. Builds a throwaway map via
/// [`tag_unilateral_exit_plan_in_records`], so missing materials fail the same way as tag.
pub fn plan_relevant_outpoint_keys(
    snapshot: &OffchainVtxoSnapshot,
    selected_leaves: &[VirtualOutPoint],
) -> ArkResult<HashSet<String>> {
    let mut records = BTreeMap::new();
    tag_unilateral_exit_plan_in_records(snapshot, selected_leaves, &mut records, 0)?;
    Ok(records.into_keys().collect())
}

/// Abort unlock (`ARK-EXIT-30`): delete a row only if it is in this plan, still `tagged`, and its
/// `host_txid` has **no** host-tx observation.
///
/// After proceed has registered a host, abort must not unlock those VTXOs (phase stays
/// `host_broadcast_attempted` or later). Rows for other plans are left untouched. Leftover
/// not-yet-unrolled `tagged` VTXOs that we delete become Start-list eligible again.
pub fn untag_unilateral_exit_plan_if_safe_in_records(
    snapshot: &OffchainVtxoSnapshot,
    selected_leaves: &[VirtualOutPoint],
    records: &mut BTreeMap<String, VtxoExitRecord>,
    observations: &BTreeMap<String, HostTxObservationRecord>,
) -> ArkResult<()> {
    if selected_leaves.is_empty() {
        return Ok(());
    }
    let relevant = plan_relevant_outpoint_keys(snapshot, selected_leaves)?;
    // `retain` keeps the row when the closure returns true.
    records.retain(|key, record| {
        if !relevant.contains(key) {
            return true;
        }
        if record.phase != VtxoExitPhase::Tagged {
            return true;
        }
        // Belt-and-suspenders: proceed writes an observation *and* advances phase. Either is
        // enough to refuse unlock.
        observations.contains_key(&record.host_txid)
    });
    Ok(())
}

/// Proceed has registered a host-tx observation for `host_txid` (immediately before broadcast).
/// Advance matching `tagged` rows to `host_broadcast_attempted` so abort can no longer untag them.
pub fn advance_records_for_host_registered(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    host_txid: &str,
) {
    for record in records.values_mut() {
        if record.host_txid == host_txid && record.phase == VtxoExitPhase::Tagged {
            record.phase = VtxoExitPhase::HostBroadcastAttempted;
        }
    }
}

/// Pull every VTXO on `host_txid` back to `phase`, except `unrolled` and later (those are on-chain).
///
/// Callers: Esplora `never_seen` budget exhausted → `tagged` (keep the row; do not idle);
/// reorg under 1 confirmation → `host_relayed` / `host_broadcast_attempted` (do not delete the
/// observation).
pub(crate) fn rewind_records_on_host(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    host_txid: &str,
    phase: VtxoExitPhase,
) {
    for record in records.values_mut() {
        if record.host_txid != host_txid {
            continue;
        }
        if record.phase >= VtxoExitPhase::Unrolled {
            continue;
        }
        record.phase = phase;
    }
}

/// Advance phases from unified B (Esplora `/raw` + confirmations) for one host tx.
///
/// `unrolled` is 6-conf (`UNILATERAL_EXIT_LEAF_CONFIRMATIONS`); `confirmations >= 1` is
/// `host_confirmed` (step wait). `complete_ready` / `exited` are not moved from here — claimable
/// overlay and complete RPC own those. Monotonic: never lowers phase except via
/// [`rewind_records_on_host`].
pub fn apply_host_observation_to_vtxo_exit_records(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    host_txid: &str,
    relayed: bool,
    confirmations: u64,
    unrolled: bool,
) {
    // Pre-unroll target from B. Six-conf (`unrolled`) is applied in the loop as a jump so we
    // never treat `Unrolled` as a monotonic "next" that could overwrite `complete_ready`.
    let next = if unrolled {
        VtxoExitPhase::Unrolled
    } else if confirmations >= 1 {
        VtxoExitPhase::HostConfirmed
    } else if relayed {
        VtxoExitPhase::HostRelayed
    } else {
        VtxoExitPhase::HostBroadcastAttempted
    };
    for record in records.values_mut() {
        if record.host_txid != host_txid {
            continue;
        }
        if record.phase >= VtxoExitPhase::CompleteReady {
            continue;
        }
        if unrolled && record.phase < VtxoExitPhase::Unrolled {
            record.phase = VtxoExitPhase::Unrolled;
            continue;
        }
        if record.phase < next && next < VtxoExitPhase::Unrolled {
            record.phase = next;
        }
    }
}

/// Complete success: mark the claimed outpoints `exited`. Missing keys are ignored (Stage 1 E:
/// complete does not require in-progress membership).
pub fn mark_records_exited_for_outpoints(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    outpoints: &[OutPoint],
) {
    for outpoint in outpoints {
        let key = vtxo_exit_record_key(&outpoint.txid.to_string(), outpoint.vout);
        if let Some(record) = records.get_mut(&key) {
            record.phase = VtxoExitPhase::Exited;
        }
    }
}

/// Unrolled + Esplora `can_be_claimed_unilaterally_by_owner` → `complete_ready`. No-op otherwise.
pub fn mark_record_complete_ready(record: &mut VtxoExitRecord) {
    if record.phase == VtxoExitPhase::Unrolled {
        record.phase = VtxoExitPhase::CompleteReady;
    }
}

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
    if observation.confirmations >= 6 {
        VtxoExitPhase::Unrolled
    } else if observation.confirmations >= 1 {
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
/// when present; otherwise `tagged`. Existing v10 rows are only raised, never replaced downward.
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

/// Unilateral-exit pipeline outpoints (`ARK-EXIT-02` / `ARK-REC-08`): `tagged`…`complete_ready`
/// (not `exited`). Same set for in-progress / Complete membership and for coin-select / recover /
/// renew exclusion (including unrolled).
pub fn unilateral_exit_pipeline_outpoints(
    records: &BTreeMap<String, VtxoExitRecord>,
) -> HashSet<UnilateralExitOutpointKey> {
    records
        .iter()
        .filter(|(_, record)| record.phase.is_pipeline())
        .filter_map(|(key, _)| {
            let (txid, vout) = parse_vtxo_exit_record_key(key)?;
            exit_outpoint_key_from_str(&txid, vout)
        })
        .collect()
}

/// Start-list exclusion (`ARK-EXIT-01` / `26` / `30`): hide `unrolled` / `complete_ready` /
/// `exited`. Do **not** hide `tagged`…`host_confirmed` — leftover not-yet-unrolled leaves stay
/// startable after abort. A second concurrent job is a frontend selection lock, not this set.
pub fn start_list_excluded_outpoints_from_records(
    records: &BTreeMap<String, VtxoExitRecord>,
) -> HashSet<UnilateralExitOutpointKey> {
    records
        .iter()
        .filter(|(_, record)| record.phase.is_start_list_excluded())
        .filter_map(|(key, _)| {
            let (txid, vout) = parse_vtxo_exit_record_key(key)?;
            exit_outpoint_key_from_str(&txid, vout)
        })
        .collect()
}

/// Dashboard **unilateral_exit_in_progress** line: sum of pipeline record amounts. Stable across
/// unroll; do not also use this as the spend-lock (see [`unilateral_exit_spend_lock_sats`]).
pub fn unilateral_exit_in_progress_sats_from_records(
    records: &BTreeMap<String, VtxoExitRecord>,
) -> u64 {
    records
        .values()
        .filter(|record| record.phase.is_pipeline())
        .fold(0u64, |acc, record| acc.saturating_add(record.amount_sats))
}

/// Sats to subtract from **net** spendable: pipeline amounts still in ark-core gross
/// (`!is_unrolled && !is_spent`). After the 6-conf stamp, those VTXOs have left gross via the
/// exiting sub-bucket — lock is 0 so the in-progress line is not subtracted again.
///
/// With no snapshot (or a missing row), fall back to pre-unroll phases only
/// (`contributes_pending_mirror`).
pub fn unilateral_exit_spend_lock_sats(
    records: &BTreeMap<String, VtxoExitRecord>,
    snapshot: Option<&OffchainVtxoSnapshot>,
) -> u64 {
    records
        .iter()
        .filter(|(_, record)| record.phase.locks_collaborative_spend())
        .filter(|(key, record)| {
            let Some((txid, vout)) = parse_vtxo_exit_record_key(key) else {
                return false;
            };
            let Some(snapshot) = snapshot else {
                return record.phase.contributes_pending_mirror();
            };
            snapshot
                .virtual_tx_outpoints
                .iter()
                .find(|row| row.txid == txid && row.vout == vout)
                .map(|row| !row.is_unrolled && !row.is_spent)
                .unwrap_or(record.phase.contributes_pending_mirror())
        })
        .fold(0u64, |acc, (_, record)| {
            acc.saturating_add(record.amount_sats)
        })
}

/// Host txs B should probe from records: not-yet-unrolled rows. Combined with the observation map
/// so a missed register still gets Esplora lookups (materials heal).
pub fn host_txids_from_vtxo_exit_records(
    records: &BTreeMap<String, VtxoExitRecord>,
) -> HashSet<String> {
    records
        .values()
        .filter(|record| record.phase < VtxoExitPhase::Unrolled)
        .map(|record| record.host_txid.clone())
        .collect()
}

/// True when this host has at least one record and every such record is `exited`. Used to drop the
/// host-tx observation after complete. No records for the host → false (do not delete on emptiness).
pub fn observation_all_records_exited(
    records: &BTreeMap<String, VtxoExitRecord>,
    host_txid: &str,
) -> bool {
    let mut any = false;
    for record in records.values() {
        if record.host_txid != host_txid {
            continue;
        }
        any = true;
        if record.phase != VtxoExitPhase::Exited {
            return false;
        }
    }
    any
}

impl crate::session::ArkSession {
    /// Fill `vtxo_exit_records` from leftover pending / watches / exiting on open (v9 import).
    pub fn heal_vtxo_exit_records(&self) {
        let wallet = self.wallet_db.snapshot();
        let mut records = wallet.vtxo_exit_records;
        heal_vtxo_exit_records_from_legacy(
            wallet.offchain_vtxo_snapshot.as_ref(),
            &wallet.pending_exit_deductions,
            &wallet.unilateral_exit_watches,
            &wallet.host_tx_observations,
            &mut records,
            crate::session::mappers::current_unix_timestamp(),
        );
        self.wallet_db.set_vtxo_exit_records(records);
    }

    /// Job start: tag the plan and register watches for tagged outpoints so B heal cannot miss them.
    pub fn tag_unilateral_exit_plan(&self, selected_leaves: &[VirtualOutPoint]) -> ArkResult<()> {
        let snapshot = self
            .wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?;
        let mut records = self.wallet_db.vtxo_exit_records();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            selected_leaves,
            &mut records,
            crate::session::mappers::current_unix_timestamp(),
        )?;
        self.wallet_db.set_vtxo_exit_records(records.clone());
        // Idempotent watches for the whole map, not only newly inserted keys.
        for (key, record) in &records {
            let Some((txid, vout)) = parse_vtxo_exit_record_key(key) else {
                continue;
            };
            crate::session::unilateral_exit::watch::register_unilateral_exit_watch(
                &self.wallet_db,
                &txid,
                vout,
                record.amount_sats,
            );
        }
        Ok(())
    }

    /// Abort: untag safe rows and drop watches for deleted keys so heal cannot resurrect them.
    pub fn untag_unilateral_exit_plan_if_safe(
        &self,
        selected_leaves: &[VirtualOutPoint],
    ) -> ArkResult<()> {
        let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot else {
            return Ok(());
        };
        let mut records = self.wallet_db.vtxo_exit_records();
        let observations = self.wallet_db.host_tx_observations();
        let keys_before: HashSet<String> = records.keys().cloned().collect();
        untag_unilateral_exit_plan_if_safe_in_records(
            &snapshot,
            selected_leaves,
            &mut records,
            &observations,
        )?;
        let keys_after: HashSet<String> = records.keys().cloned().collect();
        let removed: Vec<bitcoin::OutPoint> = keys_before
            .difference(&keys_after)
            .filter_map(|key| {
                let (txid, vout) = parse_vtxo_exit_record_key(key)?;
                exit_outpoint_key_from_str(&txid, vout)
            })
            .collect();
        self.wallet_db.set_vtxo_exit_records(records);
        if !removed.is_empty() {
            crate::session::unilateral_exit::watch::remove_unilateral_exit_watches_for_outpoints_in_wallet_db(
                &self.wallet_db,
                &removed.into_iter().collect(),
            );
        }
        Ok(())
    }

    /// Start-list hide set: `unrolled` / `complete_ready` / `exited` only.
    pub(crate) fn start_list_excluded_outpoints(&self) -> HashSet<UnilateralExitOutpointKey> {
        start_list_excluded_outpoints_from_records(&self.wallet_db.vtxo_exit_records())
    }

    /// Pipeline outpoints: in-progress / Complete membership and ARK-REC-08 exclude set
    /// (`tagged`…`complete_ready`, not `exited`).
    pub(crate) fn pipeline_outpoints(&self) -> HashSet<UnilateralExitOutpointKey> {
        unilateral_exit_pipeline_outpoints(&self.wallet_db.vtxo_exit_records())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::UNILATERAL_EXIT_LEAF_CONFIRMATIONS;
    use crate::exit_balance::is_unilateral_exit_in_progress_outpoint;
    use crate::persistence::{
        OffchainVtxoSnapshot, UnilateralExitMaterialsRecord, VirtualTxOutPointRecord,
        insert_host_tx_observation,
    };
    use crate::unilateral_exit_materials::{store_materials_for_leaf_tx, vtxo_chains_to_json};
    use ark_core::server::{ChainedTxType, VtxoChain, VtxoChains};
    use bitcoin::hashes::Hash;

    fn txid(byte: u8) -> Txid {
        Txid::from_byte_array([byte; 32])
    }

    fn chain(txid: Txid, tx_type: ChainedTxType, spends: Vec<Txid>) -> VtxoChain {
        VtxoChain {
            txid,
            tx_type,
            spends,
            expires_at: 0,
        }
    }

    fn vtxo_record(
        host: &Txid,
        vout: u32,
        amount_sats: u64,
        is_unrolled: bool,
    ) -> VirtualTxOutPointRecord {
        VirtualTxOutPointRecord {
            txid: host.to_string(),
            vout,
            created_at: 1,
            expires_at: 2,
            amount_sats,
            script_hex: String::new(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
            server_pk_hex: None,
        }
    }

    fn snapshot_with_intermediate_tree_and_ark_leaf() -> (OffchainVtxoSnapshot, Txid, Txid, Txid) {
        let commitment = txid(0x01);
        let tree = txid(0x02);
        let leaf = txid(0x03);
        let chains = VtxoChains {
            inner: vec![
                chain(commitment, ChainedTxType::Commitment, vec![]),
                chain(tree, ChainedTxType::Tree, vec![commitment]),
                chain(leaf, ChainedTxType::Ark, vec![tree]),
            ],
        };
        let chain_json = vtxo_chains_to_json(&chains).expect("encode");
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![
                vtxo_record(&tree, 0, 2_000, false),
                vtxo_record(&tree, 1, 3_000, false),
                vtxo_record(&leaf, 0, 1_000, false),
                vtxo_record(&commitment, 0, 9_000, false),
            ],
            unilateral_exit_materials_by_leaf_tx: BTreeMap::new(),
        };
        store_materials_for_leaf_tx(
            &mut snapshot,
            &leaf.to_string(),
            UnilateralExitMaterialsRecord {
                cached_at: 1,
                chain_json,
                virtual_psbts: vec![],
            },
        );
        (snapshot, tree, leaf, commitment)
    }

    fn record_phase(
        records: &BTreeMap<String, VtxoExitRecord>,
        host: &Txid,
        vout: u32,
    ) -> VtxoExitPhase {
        records
            .get(&vtxo_exit_record_key(&host.to_string(), vout))
            .map(|record| record.phase)
            .expect("record")
    }

    #[test]
    fn heal_vtxo_exit_records_from_pending_watches_and_exiting() {
        let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        snapshot.virtual_tx_outpoints[0].is_unrolled = true;
        let pending = vec![PendingExitDeductionRecord {
            kind: PendingExitKind::Unilateral,
            vtxo_txid: Some(leaf.to_string()),
            vout: Some(0),
            amount_sats: 1_000,
            started_at: 1,
            baseline_offchain_spendable_sats: None,
            retain_until_spendable_drops: false,
        }];
        let watches = vec![UnilateralExitWatchRecord {
            vtxo_txid: tree.to_string(),
            vout: 1,
            amount_sats: 3_000,
            registered_at: 1,
            published_vtxo_txid: None,
            branch_txids: vec![],
        }];
        let mut observations = BTreeMap::new();
        observations.insert(
            leaf.to_string(),
            HostTxObservationRecord {
                registered_at: 1,
                relayed: true,
                confirmations: 0,
                never_seen_probes: 0,
                last_probed_at: 1,
            },
        );
        let mut records = BTreeMap::new();
        heal_vtxo_exit_records_from_legacy(
            Some(&snapshot),
            &pending,
            &watches,
            &observations,
            &mut records,
            10,
        );
        assert_eq!(record_phase(&records, &tree, 0), VtxoExitPhase::Unrolled);
        assert_eq!(record_phase(&records, &tree, 1), VtxoExitPhase::Tagged);
        assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::HostRelayed);
    }

    #[test]
    fn tag_writes_leaf_siblings_and_en_passant_hosts() {
        let (snapshot, tree, leaf, commitment) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            5,
        )
        .expect("tag");
        assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::Tagged);
        assert_eq!(record_phase(&records, &tree, 0), VtxoExitPhase::Tagged);
        assert_eq!(record_phase(&records, &tree, 1), VtxoExitPhase::Tagged);
        assert!(!records.contains_key(&vtxo_exit_record_key(&commitment.to_string(), 0)));
        assert_eq!(
            records
                .get(&vtxo_exit_record_key(&leaf.to_string(), 0))
                .expect("leaf")
                .tagged_at,
            5
        );
    }

    #[test]
    fn tag_is_idempotent_and_does_not_downgrade() {
        let (snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect("tag");
        let key = vtxo_exit_record_key(&tree.to_string(), 0);
        records.get_mut(&key).expect("tree").phase = VtxoExitPhase::HostConfirmed;
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            9,
        )
        .expect("retag");
        assert_eq!(
            record_phase(&records, &tree, 0),
            VtxoExitPhase::HostConfirmed
        );
        assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::Tagged);
    }

    #[test]
    fn tag_missing_materials_errors() {
        let (mut snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        snapshot.unilateral_exit_materials_by_leaf_tx.clear();
        let mut records = BTreeMap::new();
        let error = tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect_err("materials");
        assert!(matches!(
            error,
            ArkWasmError::AutonomousExitMaterialsMissing
        ));
        assert!(records.is_empty());
    }

    #[test]
    fn untag_deletes_tagged_without_observation() {
        let (snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect("tag");
        untag_unilateral_exit_plan_if_safe_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            &BTreeMap::new(),
        )
        .expect("untag");
        assert!(records.is_empty());
        let _ = tree;
    }

    #[test]
    fn untag_keeps_host_broadcast_attempted_after_register() {
        let (snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect("tag");
        advance_records_for_host_registered(&mut records, &tree.to_string());
        let mut observations = BTreeMap::new();
        insert_host_tx_observation(&mut observations, &tree.to_string(), 2);
        untag_unilateral_exit_plan_if_safe_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            &observations,
        )
        .expect("untag");
        assert_eq!(
            record_phase(&records, &tree, 0),
            VtxoExitPhase::HostBroadcastAttempted
        );
        assert_eq!(
            record_phase(&records, &tree, 1),
            VtxoExitPhase::HostBroadcastAttempted
        );
        assert!(
            !records.contains_key(&vtxo_exit_record_key(&leaf.to_string(), 0)),
            "tagged leaf with no host observation unlocks"
        );
    }

    #[test]
    fn register_advances_tagged_to_host_broadcast_attempted_for_that_host_only() {
        let (snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect("tag");
        advance_records_for_host_registered(&mut records, &tree.to_string());
        assert_eq!(
            record_phase(&records, &tree, 0),
            VtxoExitPhase::HostBroadcastAttempted
        );
        assert_eq!(
            record_phase(&records, &tree, 1),
            VtxoExitPhase::HostBroadcastAttempted
        );
        assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::Tagged);
    }

    #[test]
    fn b_advances_relayed_confirmed_unrolled() {
        let (snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect("tag");
        apply_host_observation_to_vtxo_exit_records(
            &mut records,
            &leaf.to_string(),
            true,
            0,
            false,
        );
        assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::HostRelayed);
        apply_host_observation_to_vtxo_exit_records(
            &mut records,
            &leaf.to_string(),
            true,
            1,
            false,
        );
        assert_eq!(
            record_phase(&records, &leaf, 0),
            VtxoExitPhase::HostConfirmed
        );
        apply_host_observation_to_vtxo_exit_records(
            &mut records,
            &leaf.to_string(),
            true,
            u64::from(UNILATERAL_EXIT_LEAF_CONFIRMATIONS),
            true,
        );
        assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::Unrolled);
        assert_eq!(record_phase(&records, &tree, 0), VtxoExitPhase::Tagged);
    }

    #[test]
    fn never_seen_rewinds_to_tagged_and_keeps_records() {
        let (snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect("tag");
        advance_records_for_host_registered(&mut records, &leaf.to_string());
        rewind_records_on_host(&mut records, &leaf.to_string(), VtxoExitPhase::Tagged);
        assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::Tagged);
        assert!(records.contains_key(&vtxo_exit_record_key(&leaf.to_string(), 0)));
    }

    #[test]
    fn reorg_under_one_conf_rewinds_host_confirmed() {
        let (snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect("tag");
        apply_host_observation_to_vtxo_exit_records(
            &mut records,
            &leaf.to_string(),
            true,
            1,
            false,
        );
        rewind_records_on_host(&mut records, &leaf.to_string(), VtxoExitPhase::HostRelayed);
        assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::HostRelayed);
    }

    #[test]
    fn in_progress_outpoints_are_record_derived() {
        let (snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect("tag");
        let keys = unilateral_exit_pipeline_outpoints(&records);
        assert!(is_unilateral_exit_in_progress_outpoint(
            &keys,
            &leaf.to_string(),
            0
        ));
        assert!(is_unilateral_exit_in_progress_outpoint(
            &keys,
            &tree.to_string(),
            0
        ));
        let exited_key = vtxo_exit_record_key(&leaf.to_string(), 0);
        records.get_mut(&exited_key).expect("leaf").phase = VtxoExitPhase::Exited;
        let keys = unilateral_exit_pipeline_outpoints(&records);
        assert!(!is_unilateral_exit_in_progress_outpoint(
            &keys,
            &leaf.to_string(),
            0
        ));
    }

    #[test]
    fn start_list_includes_tagged_not_unrolled_and_excludes_unrolled() {
        let (snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect("tag");
        records
            .get_mut(&vtxo_exit_record_key(&tree.to_string(), 0))
            .expect("tree")
            .phase = VtxoExitPhase::Unrolled;
        let excluded = start_list_excluded_outpoints_from_records(&records);
        assert!(is_unilateral_exit_in_progress_outpoint(
            &excluded,
            &tree.to_string(),
            0
        ));
        assert!(!is_unilateral_exit_in_progress_outpoint(
            &excluded,
            &leaf.to_string(),
            0
        ));
    }

    #[test]
    fn spend_lock_reduces_spendable_only_while_still_in_gross() {
        let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect("tag");
        let locked = unilateral_exit_spend_lock_sats(&records, Some(&snapshot));
        assert_eq!(locked, 1_000 + 2_000 + 3_000);
        snapshot.virtual_tx_outpoints[0].is_unrolled = true;
        records
            .get_mut(&vtxo_exit_record_key(&tree.to_string(), 0))
            .expect("tree")
            .phase = VtxoExitPhase::Unrolled;
        let locked = unilateral_exit_spend_lock_sats(&records, Some(&snapshot));
        assert_eq!(locked, 1_000 + 3_000);
        let pipeline = unilateral_exit_in_progress_sats_from_records(&records);
        assert_eq!(pipeline, 1_000 + 2_000 + 3_000);
    }

    #[test]
    fn pipeline_outpoints_are_excluded_from_spendable_selection() {
        let (snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut records = BTreeMap::new();
        tag_unilateral_exit_plan_in_records(
            &snapshot,
            &[VirtualOutPoint::new(leaf, 0)],
            &mut records,
            1,
        )
        .expect("tag");
        let excluded = unilateral_exit_pipeline_outpoints(&records);
        let spendable = vec![
            OutPoint {
                txid: leaf,
                vout: 0,
            },
            OutPoint {
                txid: txid(0x99),
                vout: 0,
            },
        ];
        let filtered: Vec<_> = spendable
            .into_iter()
            .filter(|outpoint| !excluded.contains(outpoint))
            .collect();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].txid, txid(0x99));
        let _ = tree;
    }
}
