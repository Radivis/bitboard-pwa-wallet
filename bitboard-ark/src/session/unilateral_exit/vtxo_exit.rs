//! Per-outpoint VTXO exit records (`ARK-EXIT-27` / `ARK-EXIT-30`).
//!
//! These records are the durable source of truth for pipeline membership, spend-lock (send /
//! collab / renew / delegate), recover/migrate pipeline exclusion, Start-list exclusion, and
//! abort unlock. Idle is **no row**. Host-tx observations (broadcast / relay / confirmations)
//! live in a separate map keyed by virtual txid and **feed** phase advances here; they are not
//! themselves the spend-lock.
//!
//! Phase order (persisted): `tagged` → `host_broadcast_attempted` → `host_relayed` →
//! `host_confirmed` → `unrolled` → `complete_ready` → `exited`. `funding_lost` is a terminal
//! side-branch (`ARK-EXIT-33`). Never downgrade a higher phase back to `tagged` except the
//! explicit rewinds (`never_seen` → `tagged`; reorg under 1 conf → relayed / attempted).
//!
//! `host_txid` on a record is the virtual tx that **hosts that outpoint** (the VTXO's own txid),
//! not an ancestor unless the outpoint lives on that ancestor.

use std::collections::{BTreeMap, HashSet};

use bitcoin::OutPoint;

use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::{UnilateralExitOutpointKey, exit_outpoint_key_from_str};
use crate::outpoint::VirtualOutPoint;
use crate::persistence::{
    HostTxObservationRecord, OffchainVtxoSnapshot, VtxoExitPhase, VtxoExitRecord,
    vtxo_exit_record_key,
};
use crate::session::unilateral_exit::plan::exit_eligible_records_for_topology_hosts_from_snapshot;
use crate::session::unilateral_exit::progress::step_reached_confirmation;
use crate::session::unilateral_exit::topology::{
    merge_topology_nodes_from_chains, virtual_tx_type_hosts_exit_outpoints,
};
use crate::unilateral_exit_materials::{
    require_unilateral_exit_materials_for_host_tx, vtxo_amount_sats_from_snapshot,
    vtxo_chains_from_snapshot_materials,
};

pub use super::vtxo_exit_heal::heal_vtxo_exit_records_from_legacy;
pub use super::vtxo_exit_materials::{
    host_txids_on_same_materials_branch, materials_chain_txid_strings_for_host,
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
        require_unilateral_exit_materials_for_host_tx(snapshot, &leaf_txid)?;
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
/// `host_broadcast_attempted` or later) **while the observation exists**. `never_seen` cleanup
/// deletes the observation and rewinds to `tagged`; abort then matches the nothing-registered
/// case. Rows for other plans are left untouched. Leftover not-yet-unrolled `tagged` VTXOs that
/// we delete become Start-list eligible again.
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
/// Callers: Esplora `never_seen` budget exhausted → `tagged` (keep the row; do not idle — abort
/// may unlock only after this rewind deletes the observation); reorg under 1 confirmation →
/// `host_relayed` / `host_broadcast_attempted` (do not delete the observation).
pub(crate) fn rewind_records_on_host(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    host_txid: &str,
    phase: VtxoExitPhase,
) {
    for record in records.values_mut() {
        if record.host_txid != host_txid {
            continue;
        }
        if !record.phase.is_pre_unroll() {
            continue;
        }
        record.phase = phase;
    }
}

/// Advance phases from Esplora `/raw` + confirmation depth for one host tx.
///
/// `unrolled` is 6-conf (`UNILATERAL_EXIT_HOST_TX_CONFIRMATIONS`); step confirmation is
/// `host_confirmed` (`UNILATERAL_EXIT_STEP_CONFIRMATIONS`). `complete_ready` / `exited` are not moved from here — claimable
/// overlay and complete RPC own those. A premature `unrolled` phase (heal from a false snapshot
/// stamp) is pulled back when Esplora is still below 6-conf.
pub fn apply_host_observation_to_vtxo_exit_records(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    host_txid: &str,
    relayed: bool,
    confirmations: u64,
    unrolled: bool,
) {
    // Pre-unroll target from Esplora. Six-conf (`unrolled`) is applied in the loop as a jump so we
    // never treat `Unrolled` as a monotonic "next" that could overwrite `complete_ready`.
    let next = if unrolled {
        VtxoExitPhase::Unrolled
    } else if step_reached_confirmation(confirmations) {
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
        if record.phase.is_terminal() || record.phase == VtxoExitPhase::CompleteReady {
            continue;
        }
        if unrolled && record.phase.is_pre_unroll() {
            record.phase = VtxoExitPhase::Unrolled;
            continue;
        }
        if !unrolled && record.phase == VtxoExitPhase::Unrolled {
            record.phase = next;
            continue;
        }
        if record.phase.is_pre_unroll() && record.phase < next && next < VtxoExitPhase::Unrolled {
            record.phase = next;
        }
    }
}

/// Complete RPC must refuse `funding_lost` even if the snapshot still looks unrolled.
pub fn validate_records_not_funding_lost(
    records: &BTreeMap<String, VtxoExitRecord>,
    vtxo_outpoints: &[VirtualOutPoint],
) -> ArkResult<()> {
    for outpoint in vtxo_outpoints {
        let key = vtxo_exit_record_key(&outpoint.txid.to_string(), outpoint.vout);
        if records
            .get(&key)
            .is_some_and(|record| record.phase == VtxoExitPhase::FundingLost)
        {
            return Err(ArkWasmError::VtxoFundingLost {
                txid: outpoint.txid.to_string(),
                vout: outpoint.vout,
            });
        }
    }
    Ok(())
}

/// Complete success: mark the claimed outpoints `exited`. Missing keys are ignored because
/// complete does not require in-progress membership.
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

/// Read-only DTO dump for frontend VTXO child hydrate (`ARK-EXIT-32`). No Esplora.
pub fn vtxo_exit_record_dtos(
    records: &BTreeMap<String, VtxoExitRecord>,
) -> Vec<crate::api_types::VtxoExitRecordDto> {
    let mut rows: Vec<crate::api_types::VtxoExitRecordDto> = records
        .iter()
        .filter_map(|(key, record)| {
            let (txid, vout) = parse_vtxo_exit_record_key(key)?;
            Some(crate::api_types::VtxoExitRecordDto {
                txid,
                vout,
                amount_sats: record.amount_sats,
                phase: record.phase,
                tagged_at: record.tagged_at,
            })
        })
        .collect();
    rows.sort_by(|left, right| {
        left.txid
            .cmp(&right.txid)
            .then_with(|| left.vout.cmp(&right.vout))
    });
    rows
}

fn record_outpoint_keys_where(
    records: &BTreeMap<String, VtxoExitRecord>,
    include_phase: impl Fn(VtxoExitPhase) -> bool,
) -> HashSet<UnilateralExitOutpointKey> {
    records
        .iter()
        .filter(|(_, record)| include_phase(record.phase))
        .filter_map(|(key, _)| {
            let (txid, vout) = parse_vtxo_exit_record_key(key)?;
            exit_outpoint_key_from_str(&txid, vout)
        })
        .collect()
}

/// Unilateral-exit pipeline outpoints (`ARK-EXIT-02` / `ARK-REC-08`): `tagged`…`complete_ready`
/// (not `exited`, not `funding_lost`). In-progress / Complete membership, and the recover /
/// signer-migrate exclude set. Collaborative spend-lock uses
/// [`unilateral_exit_spend_locked_outpoints`].
pub fn unilateral_exit_pipeline_outpoints(
    records: &BTreeMap<String, VtxoExitRecord>,
) -> HashSet<UnilateralExitOutpointKey> {
    record_outpoint_keys_where(records, VtxoExitPhase::is_pipeline)
}

/// Outpoints that must not be sent, collaboratively exited, renewed, or delegated (`ARK-EXIT-27`):
/// pipeline plus `funding_lost`. Recover and signer-migrate must **not** use this set. Do **not**
/// fold `funding_lost` into [`unilateral_exit_pipeline_outpoints`] — seized coins are not
/// Complete-list members.
pub fn unilateral_exit_spend_locked_outpoints(
    records: &BTreeMap<String, VtxoExitRecord>,
) -> HashSet<UnilateralExitOutpointKey> {
    record_outpoint_keys_where(records, VtxoExitPhase::locks_collaborative_spend)
}

/// Start-list exclusion (`ARK-EXIT-01` / `26` / `30`): hide `unrolled` / `complete_ready` /
/// `exited` / `funding_lost`. Do **not** hide `tagged`…`host_confirmed` — leftover not-yet-unrolled
/// leaves stay startable after abort. A second concurrent job is a frontend selection lock, not
/// this set.
pub fn start_list_excluded_outpoints_from_records(
    records: &BTreeMap<String, VtxoExitRecord>,
) -> HashSet<UnilateralExitOutpointKey> {
    record_outpoint_keys_where(records, VtxoExitPhase::is_start_list_excluded)
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

/// Host txs Esplora should probe from records: not-yet-unrolled rows. Combined with the observation map
/// so a missed register still gets Esplora lookups (materials heal).
pub fn host_txids_from_vtxo_exit_records(
    records: &BTreeMap<String, VtxoExitRecord>,
) -> HashSet<String> {
    records
        .values()
        .filter(|record| record.phase.is_pre_unroll())
        .map(|record| record.host_txid.clone())
        .collect()
}

/// True when this host has at least one record and every such record is `exited` or
/// `funding_lost`. Used to drop the host-tx observation after complete or seizure. No records
/// for the host → false (do not delete on emptiness).
pub fn observation_all_records_terminal(
    records: &BTreeMap<String, VtxoExitRecord>,
    host_txid: &str,
) -> bool {
    let mut any = false;
    for record in records.values() {
        if record.host_txid != host_txid {
            continue;
        }
        any = true;
        if !record.phase.is_terminal() {
            return false;
        }
    }
    any
}

/// Stamp every still-pre-unroll record whose key is in `keys` as `funding_lost`. Leaves
/// `unrolled` / `complete_ready` / `exited` unchanged (`ARK-EXIT-33` mixed outcomes).
pub fn stamp_pre_unroll_records_funding_lost(
    records: &mut BTreeMap<String, VtxoExitRecord>,
    keys: &HashSet<String>,
) {
    for key in keys {
        let Some(record) = records.get_mut(key) else {
            continue;
        };
        if record.phase.is_pre_unroll() {
            record.phase = VtxoExitPhase::FundingLost;
        }
    }
}

/// Stamp still-pre-unroll records on seized ASP-swept branches (`ARK-EXIT-33` / `ARK-AUTO-05`).
///
/// Autonomous mode never stamps from snapshot `is_swept`. Locally unrolled hosts are skipped
/// (indexer lag). Already `unrolled` / `complete_ready` siblings are left claimable.
pub fn stamp_pre_unroll_records_funding_lost_for_asp_swept(
    snapshot: &OffchainVtxoSnapshot,
    records: &mut BTreeMap<String, VtxoExitRecord>,
    autonomous_mode: bool,
    virtual_tx_is_marked_unrolled: impl Fn(&str) -> bool,
) -> ArkResult<bool> {
    if autonomous_mode {
        return Ok(false);
    }
    let pre_unroll: Vec<(String, u32)> = records
        .iter()
        .filter(|(_, record)| record.phase.is_pre_unroll())
        .filter_map(|(key, _)| parse_vtxo_exit_record_key(key))
        .collect();
    let mut keys_to_stamp = HashSet::new();
    for (txid, vout) in pre_unroll {
        if virtual_tx_is_marked_unrolled(&txid) {
            continue;
        }
        let Some(row) = snapshot
            .virtual_tx_outpoints
            .iter()
            .find(|row| row.txid == txid && row.vout == vout)
        else {
            continue;
        };
        if row.is_swept && !row.is_unrolled {
            keys_to_stamp.extend(pre_unroll_record_keys_on_same_branch(
                snapshot, records, &txid, vout,
            )?);
        }
    }
    if keys_to_stamp.is_empty() {
        return Ok(false);
    }
    stamp_pre_unroll_records_funding_lost(records, &keys_to_stamp);
    Ok(true)
}

/// Pre-unroll record keys that share a materials branch with `seed` (`ARK-EXIT-33`).
pub fn pre_unroll_record_keys_on_same_branch(
    snapshot: &OffchainVtxoSnapshot,
    records: &BTreeMap<String, VtxoExitRecord>,
    seed_txid: &str,
    seed_vout: u32,
) -> ArkResult<HashSet<String>> {
    let seed_key = vtxo_exit_record_key(seed_txid, seed_vout);
    let seed_host = records
        .get(&seed_key)
        .map(|record| record.host_txid.clone())
        .unwrap_or_else(|| seed_txid.to_string());
    let branch_hosts = host_txids_on_same_materials_branch(snapshot, &seed_host)?;
    let mut keys = HashSet::new();
    keys.insert(seed_key);
    for (key, record) in records {
        if record.phase.is_pre_unroll() && branch_hosts.contains(&record.host_txid) {
            keys.insert(key.clone());
        }
    }
    Ok(keys)
}

impl crate::session::ArkSession {
    /// Fill `vtxo_exit_records` from leftover pending / exiting on open (v3 import).
    pub fn heal_vtxo_exit_records(&self) {
        let wallet = self.wallet_db.snapshot();
        let mut records = wallet.vtxo_exit_records;
        heal_vtxo_exit_records_from_legacy(
            wallet.offchain_vtxo_snapshot.as_ref(),
            &wallet.pending_exit_deductions,
            &mut records,
            crate::session::mappers::current_unix_timestamp(),
        );
        self.wallet_db.set_vtxo_exit_records(records);
    }

    /// Job start: tag the plan. Survival across snapshot replace is unrolled+ records.
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
        self.wallet_db.set_vtxo_exit_records(records);
        Ok(())
    }

    /// Abort: untag safe rows (tagged with no host observation).
    pub fn untag_unilateral_exit_plan_if_safe(
        &self,
        selected_leaves: &[VirtualOutPoint],
    ) -> ArkResult<()> {
        let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot else {
            return Ok(());
        };
        let mut records = self.wallet_db.vtxo_exit_records();
        let observations = self.wallet_db.host_tx_observations();
        untag_unilateral_exit_plan_if_safe_in_records(
            &snapshot,
            selected_leaves,
            &mut records,
            &observations,
        )?;
        self.wallet_db.set_vtxo_exit_records(records);
        Ok(())
    }

    /// Start-list hide set: `unrolled` / `complete_ready` / `exited` / `funding_lost`.
    pub(crate) fn start_list_excluded_outpoints(&self) -> HashSet<UnilateralExitOutpointKey> {
        start_list_excluded_outpoints_from_records(&self.wallet_db.vtxo_exit_records())
    }

    /// Pipeline outpoints: in-progress / Complete membership and recover / signer-migrate
    /// exclude set (`tagged`…`complete_ready`, not `exited` / `funding_lost`).
    pub(crate) fn pipeline_outpoints(&self) -> HashSet<UnilateralExitOutpointKey> {
        unilateral_exit_pipeline_outpoints(&self.wallet_db.vtxo_exit_records())
    }

    /// Spend-lock exclude set (`ARK-EXIT-27`): pipeline plus `funding_lost`. Send / collab /
    /// renew / delegate only — not recover or signer-migrate.
    pub(crate) fn spend_locked_outpoints(&self) -> HashSet<UnilateralExitOutpointKey> {
        unilateral_exit_spend_locked_outpoints(&self.wallet_db.vtxo_exit_records())
    }

    /// Dump persisted VTXO exit records without probing Esplora. Frontend child actors hydrate from this.
    pub fn list_vtxo_exit_records(&self) -> Vec<crate::api_types::VtxoExitRecordDto> {
        vtxo_exit_record_dtos(&self.wallet_db.vtxo_exit_records())
    }
}

#[cfg(test)]
#[path = "vtxo_exit_tests.rs"]
mod tests;
