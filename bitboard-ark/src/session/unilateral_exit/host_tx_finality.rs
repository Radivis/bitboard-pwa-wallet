use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::str::FromStr;

use bitcoin::Txid;

use crate::constants::{
    HOST_TX_NEVER_SEEN_FIRST_PROBE_AFTER_SECS, HOST_TX_NEVER_SEEN_MAX_ELIGIBLE_MISSES,
    HOST_TX_NEVER_SEEN_PROBE_SPACING_SECS, UNILATERAL_EXIT_HOST_TX_CONFIRMATIONS,
};
use crate::error::ArkResult;
use crate::esplora_blockchain::EsploraBlockchain;
use crate::offchain_snapshot::{
    clear_virtual_tx_vtxos_unrolled_in_snapshot, mark_virtual_tx_vtxos_unrolled_in_snapshot,
};
use crate::persistence::{
    HostTxObservationRecord, OffchainVtxoSnapshot, PendingExitDeductionRecord, PendingExitKind,
    VtxoExitPhase, VtxoExitRecord,
};
use crate::session::ArkSession;
use crate::session::mappers::current_unix_timestamp;
use crate::session::unilateral_exit::progress::{
    host_tx_reached_finality, step_reached_confirmation,
};
use crate::session::unilateral_exit::topology::virtual_tx_type_hosts_exit_outpoints;
use crate::session::unilateral_exit::vtxo_exit::{
    apply_host_observation_to_vtxo_exit_records, host_txids_from_vtxo_exit_records,
    observation_all_records_terminal, rewind_records_on_host,
};
use crate::unilateral_exit_materials::{
    chained_tx_type_label, snapshot_materials_for_host_tx, vtxo_chains_from_json,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct HostTxProbe {
    pub seen: bool,
    pub confirmations: u64,
}

pub(crate) fn vtxo_host_txids_from_materials(
    snapshot: &OffchainVtxoSnapshot,
) -> ArkResult<Vec<String>> {
    let material_host_txids: Vec<String> = snapshot
        .unilateral_exit_materials_by_host_tx
        .keys()
        .cloned()
        .collect();
    host_txids_for_material_keys(snapshot, &material_host_txids)
}

fn host_txids_for_material_keys(
    snapshot: &OffchainVtxoSnapshot,
    material_keys: &[String],
) -> ArkResult<Vec<String>> {
    let mut host_txids = Vec::new();
    let mut seen = HashSet::new();
    for material_key in material_keys {
        let Some(materials) = snapshot_materials_for_host_tx(snapshot, material_key) else {
            continue;
        };
        let Ok(chains) = vtxo_chains_from_json(&materials.chain_json) else {
            continue;
        };
        for link in &chains.inner {
            let tx_type = chained_tx_type_label(&link.tx_type);
            if !virtual_tx_type_hosts_exit_outpoints(&tx_type) {
                continue;
            }
            let txid = link.txid.to_string();
            if seen.insert(txid.clone()) {
                host_txids.push(txid);
            }
        }
    }
    Ok(host_txids)
}

fn pending_unilateral_host_txids(pending: &[PendingExitDeductionRecord]) -> Vec<String> {
    let mut host_txids = Vec::new();
    let mut seen = HashSet::new();
    for record in pending {
        if record.kind != PendingExitKind::Unilateral {
            continue;
        }
        let Some(txid) = record.vtxo_txid.as_ref() else {
            continue;
        };
        if seen.insert(txid.clone()) {
            host_txids.push(txid.clone());
        }
    }
    host_txids
}

pub(crate) fn host_txids_to_probe(
    snapshot: &OffchainVtxoSnapshot,
    observations: &BTreeMap<String, HostTxObservationRecord>,
    pending: &[PendingExitDeductionRecord],
    vtxo_exit_records: &BTreeMap<String, VtxoExitRecord>,
) -> ArkResult<BTreeSet<String>> {
    let mut txids = BTreeSet::new();
    for (txid, record) in observations {
        if record.confirmations < u64::from(UNILATERAL_EXIT_HOST_TX_CONFIRMATIONS) {
            txids.insert(txid.clone());
        }
    }
    for host_txid in host_txids_from_vtxo_exit_records(vtxo_exit_records) {
        if observations.get(&host_txid).is_none_or(|record| {
            record.confirmations < u64::from(UNILATERAL_EXIT_HOST_TX_CONFIRMATIONS)
        }) {
            txids.insert(host_txid);
        }
    }
    let pending_host_txids = pending_unilateral_host_txids(pending);
    for host_txid in host_txids_for_material_keys(snapshot, &pending_host_txids)? {
        if !observations.contains_key(&host_txid) {
            txids.insert(host_txid);
        }
    }
    Ok(txids)
}

fn never_seen_miss_is_eligible(record: &HostTxObservationRecord, now: i64) -> bool {
    if record.never_seen_probes == 0 {
        now >= record.registered_at + HOST_TX_NEVER_SEEN_FIRST_PROBE_AFTER_SECS
    } else {
        now >= record.last_probed_at + HOST_TX_NEVER_SEEN_PROBE_SPACING_SECS
    }
}

/// Count an Esplora miss toward the never-seen budget only when it is eligible.
///
/// `last_probed_at` is the last *eligible* miss, not every Esplora reconcile. Frequent list/progress
/// probes (15s UI) must not reset the 1-minute spacing (`ARK-EXIT-28`).
///
/// This budget is the delayed cleanup of proceed's pre-broadcast register: do not rewind on
/// the first miss or because `step_wait` is unset. After five eligible misses, delete the
/// observation and rewind to `tagged` (keep rows). See docs/unilateral-exit.md
/// "Register before Esplora; never_seen is the cleanup".
fn apply_absent_probe(record: &mut HostTxObservationRecord, now: i64) -> bool {
    if never_seen_miss_is_eligible(record, now) {
        record.never_seen_probes = record.never_seen_probes.saturating_add(1);
        record.last_probed_at = now;
    }
    record.never_seen_probes >= HOST_TX_NEVER_SEEN_MAX_ELIGIBLE_MISSES
}

fn stamp_host_if_final(
    snapshot: &mut OffchainVtxoSnapshot,
    host_txid: &str,
    confirmations: u64,
) -> bool {
    if !host_tx_reached_finality(confirmations) {
        clear_virtual_tx_vtxos_unrolled_in_snapshot(snapshot, host_txid);
        return false;
    }
    mark_virtual_tx_vtxos_unrolled_in_snapshot(snapshot, host_txid);
    true
}

fn observation_all_snapshot_vouts_spent(snapshot: &OffchainVtxoSnapshot, host_txid: &str) -> bool {
    let mut saw_vout = false;
    for record in &snapshot.virtual_tx_outpoints {
        if record.txid != host_txid {
            continue;
        }
        saw_vout = true;
        if !record.is_spent {
            return false;
        }
    }
    saw_vout
}

pub(crate) fn reconcile_host_tx_finality_state(
    snapshot: &mut OffchainVtxoSnapshot,
    observations: &mut BTreeMap<String, HostTxObservationRecord>,
    pending: &[PendingExitDeductionRecord],
    vtxo_exit_records: &mut BTreeMap<String, VtxoExitRecord>,
    now: i64,
    probe: impl Fn(&str) -> Option<HostTxProbe>,
) -> ArkResult<()> {
    let stampable_hosts: HashSet<String> = vtxo_host_txids_from_materials(snapshot)?
        .into_iter()
        .collect();
    let txids = host_txids_to_probe(snapshot, observations, pending, vtxo_exit_records)?;
    let mut delete_txids = Vec::new();

    for txid in txids {
        let Some(HostTxProbe {
            seen,
            confirmations,
        }) = probe(&txid)
        else {
            continue;
        };
        let unrolled = if stampable_hosts.contains(&txid) {
            stamp_host_if_final(snapshot, &txid, confirmations)
        } else {
            false
        };
        if let Some(record) = observations.get_mut(&txid) {
            let previous_confirmations = record.confirmations;
            let previously_relayed = record.relayed;
            if confirmations > 0 || seen {
                if step_reached_confirmation(previous_confirmations) && confirmations == 0 {
                    rewind_records_on_host(
                        vtxo_exit_records,
                        &txid,
                        if seen {
                            VtxoExitPhase::HostRelayed
                        } else {
                            VtxoExitPhase::HostBroadcastAttempted
                        },
                    );
                }
                record.relayed = true;
                record.confirmations = confirmations;
                record.last_probed_at = now;
                record.never_seen_probes = 0;
                apply_host_observation_to_vtxo_exit_records(
                    vtxo_exit_records,
                    &txid,
                    true,
                    confirmations,
                    unrolled,
                );
            } else if previously_relayed || step_reached_confirmation(previous_confirmations) {
                record.relayed = false;
                record.confirmations = 0;
                record.last_probed_at = now;
                rewind_records_on_host(
                    vtxo_exit_records,
                    &txid,
                    VtxoExitPhase::HostBroadcastAttempted,
                );
            } else if apply_absent_probe(record, now) {
                delete_txids.push(txid);
            }
        } else if stampable_hosts.contains(&txid) && (seen || confirmations > 0) {
            apply_host_observation_to_vtxo_exit_records(
                vtxo_exit_records,
                &txid,
                seen || confirmations > 0,
                confirmations,
                unrolled,
            );
        }
    }

    for txid in &delete_txids {
        rewind_records_on_host(vtxo_exit_records, txid, VtxoExitPhase::Tagged);
        observations.remove(txid);
    }

    observations.retain(|txid, _| {
        !observation_all_snapshot_vouts_spent(snapshot, txid)
            && !observation_all_records_terminal(vtxo_exit_records, txid)
    });
    Ok(())
}

fn warn_host_tx_finality_failed(message: &str) {
    #[cfg(target_arch = "wasm32")]
    web_sys::console::warn_1(&message.into());
    #[cfg(not(target_arch = "wasm32"))]
    eprintln!("{message}");
}

async fn probe_host_tx_on_esplora(
    blockchain: &EsploraBlockchain,
    txid: &Txid,
) -> Option<HostTxProbe> {
    let confirmations = match blockchain.get_tx_confirmations(txid).await {
        Ok(confirmations) => confirmations,
        Err(error) => {
            warn_host_tx_finality_failed(&format!(
                "Host-tx confirmation probe failed for {txid}: {error}"
            ));
            return None;
        }
    };
    let seen = match blockchain.is_tx_relayed_on_network(txid).await {
        Ok(relayed) => relayed,
        Err(error) => {
            if confirmations > 0 {
                true
            } else {
                warn_host_tx_finality_failed(&format!(
                    "Host-tx relay probe failed for {txid}: {error}"
                ));
                return None;
            }
        }
    };
    Some(HostTxProbe {
        seen,
        confirmations,
    })
}

impl ArkSession {
    /// Unified 6-conf stamper plus never-seen budget (ARK-EXIT-28/29). Probe HTTP errors skip
    /// that txid rather than failing the pass or incrementing `never_seen`.
    pub(crate) async fn reconcile_host_tx_finality(&self) -> ArkResult<Vec<String>> {
        let Some(mut snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() else {
            return Ok(Vec::new());
        };
        let snapshot_before_probes = snapshot.clone();
        let mut observations = self.wallet_db.host_tx_observations();
        let pending = self.wallet_db.pending_exit_deductions();
        let mut vtxo_exit_records = self.wallet_db.vtxo_exit_records();
        crate::session::unilateral_exit::vtxo_exit::heal_vtxo_exit_records_from_legacy(
            Some(&snapshot),
            &pending,
            &mut vtxo_exit_records,
            current_unix_timestamp(),
        );
        let txids = host_txids_to_probe(&snapshot, &observations, &pending, &vtxo_exit_records)?;
        let blockchain = self.client.blockchain();
        if !txids.is_empty() {
            blockchain.prepare_confirmation_scan().await;
        }
        let mut probes = HashMap::new();
        for txid_str in &txids {
            let Ok(txid) = Txid::from_str(txid_str) else {
                continue;
            };
            if let Some(probe) = probe_host_tx_on_esplora(blockchain, &txid).await {
                probes.insert(txid_str.clone(), probe);
            }
        }
        let now = current_unix_timestamp();
        reconcile_host_tx_finality_state(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut vtxo_exit_records,
            now,
            |txid| probes.get(txid).copied(),
        )?;
        self.commit_overlaid_snapshot(&snapshot_before_probes, snapshot);
        self.wallet_db.set_host_tx_observations(observations);
        self.wallet_db.set_vtxo_exit_records(vtxo_exit_records);
        self.reconcile_vtxo_exit_viability().await
    }

    pub(crate) async fn reconcile_host_tx_finality_best_effort(&self) {
        if let Err(error) = self.reconcile_host_tx_finality().await {
            warn_host_tx_finality_failed(&format!(
                "Host-tx finality reconcile failed; continuing: {error}"
            ));
        }
    }
}

#[cfg(test)]
#[path = "host_tx_finality_tests.rs"]
mod tests;
