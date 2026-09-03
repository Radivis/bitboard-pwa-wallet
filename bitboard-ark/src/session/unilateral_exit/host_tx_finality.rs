use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::str::FromStr;

use bitcoin::Txid;

use crate::constants::{
    HOST_TX_NEVER_SEEN_FIRST_PROBE_AFTER_SECS, HOST_TX_NEVER_SEEN_MAX_ELIGIBLE_MISSES,
    HOST_TX_NEVER_SEEN_PROBE_SPACING_SECS, UNILATERAL_EXIT_LEAF_CONFIRMATIONS,
};
use crate::error::ArkResult;
use crate::esplora_blockchain::EsploraBlockchain;
use crate::offchain_snapshot::mark_virtual_tx_vtxos_unrolled_in_snapshot;
use crate::persistence::{
    HostTxObservationRecord, OffchainVtxoSnapshot, PendingExitDeductionRecord, PendingExitKind,
    UnilateralExitWatchRecord,
};
use crate::session::ArkSession;
use crate::session::mappers::current_unix_timestamp;
use crate::session::unilateral_exit::progress::leaf_reached_finality;
use crate::session::unilateral_exit::topology::virtual_tx_type_hosts_exit_outpoints;
use crate::unilateral_exit_materials::{
    chained_tx_type_label, snapshot_materials_for_leaf_tx, vtxo_chains_from_json,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct HostTxProbe {
    pub seen: bool,
    pub confirmations: u64,
}

pub(crate) fn vtxo_host_txids_from_materials(
    snapshot: &OffchainVtxoSnapshot,
) -> ArkResult<Vec<String>> {
    let material_leaf_txids: Vec<String> = snapshot
        .unilateral_exit_materials_by_leaf_tx
        .keys()
        .cloned()
        .collect();
    host_txids_for_leaf_keys(snapshot, &material_leaf_txids)
}

fn host_txids_for_leaf_keys(
    snapshot: &OffchainVtxoSnapshot,
    leaf_txids: &[String],
) -> ArkResult<Vec<String>> {
    let mut host_txids = Vec::new();
    let mut seen = HashSet::new();
    for leaf_txid in leaf_txids {
        let Some(materials) = snapshot_materials_for_leaf_tx(snapshot, leaf_txid) else {
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

fn pending_unilateral_leaf_txids(pending: &[PendingExitDeductionRecord]) -> Vec<String> {
    let mut leaf_txids = Vec::new();
    let mut seen = HashSet::new();
    for record in pending {
        if record.kind != PendingExitKind::Unilateral {
            continue;
        }
        let Some(txid) = record.vtxo_txid.as_ref() else {
            continue;
        };
        if seen.insert(txid.clone()) {
            leaf_txids.push(txid.clone());
        }
    }
    leaf_txids
}

pub(crate) fn host_txids_to_probe(
    snapshot: &OffchainVtxoSnapshot,
    observations: &BTreeMap<String, HostTxObservationRecord>,
    pending: &[PendingExitDeductionRecord],
) -> ArkResult<BTreeSet<String>> {
    let mut txids = BTreeSet::new();
    for (txid, record) in observations {
        if record.confirmations < u64::from(UNILATERAL_EXIT_LEAF_CONFIRMATIONS) {
            txids.insert(txid.clone());
        }
    }
    let pending_leaves = pending_unilateral_leaf_txids(pending);
    for host_txid in host_txids_for_leaf_keys(snapshot, &pending_leaves)? {
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

fn apply_absent_probe(record: &mut HostTxObservationRecord, now: i64) -> bool {
    if never_seen_miss_is_eligible(record, now) {
        record.never_seen_probes = record.never_seen_probes.saturating_add(1);
    }
    record.last_probed_at = now;
    record.never_seen_probes >= HOST_TX_NEVER_SEEN_MAX_ELIGIBLE_MISSES
}

fn enrich_watches_for_stamped_host(
    watches: &mut Vec<UnilateralExitWatchRecord>,
    snapshot: &OffchainVtxoSnapshot,
    host_txid: &str,
    now: i64,
) {
    for record in &snapshot.virtual_tx_outpoints {
        if record.txid != host_txid {
            continue;
        }
        if let Some(existing) = watches
            .iter_mut()
            .find(|watch| watch.vtxo_txid == record.txid && watch.vout == record.vout)
        {
            existing.published_vtxo_txid = Some(host_txid.to_string());
            existing.amount_sats = record.amount_sats;
            continue;
        }
        watches.push(UnilateralExitWatchRecord {
            vtxo_txid: record.txid.clone(),
            vout: record.vout,
            amount_sats: record.amount_sats,
            registered_at: now,
            published_vtxo_txid: Some(host_txid.to_string()),
            branch_txids: Vec::new(),
        });
    }
}

fn stamp_host_if_final(
    snapshot: &mut OffchainVtxoSnapshot,
    watches: &mut Vec<UnilateralExitWatchRecord>,
    host_txid: &str,
    confirmations: u64,
    now: i64,
) -> bool {
    if !leaf_reached_finality(confirmations) {
        return false;
    }
    mark_virtual_tx_vtxos_unrolled_in_snapshot(snapshot, host_txid);
    enrich_watches_for_stamped_host(watches, snapshot, host_txid, now);
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
    watches: &mut Vec<UnilateralExitWatchRecord>,
    now: i64,
    probe: impl Fn(&str) -> Option<HostTxProbe>,
) -> ArkResult<()> {
    let stampable_hosts: HashSet<String> = vtxo_host_txids_from_materials(snapshot)?
        .into_iter()
        .collect();
    let txids = host_txids_to_probe(snapshot, observations, pending)?;
    let mut delete_txids = Vec::new();

    for txid in txids {
        let Some(HostTxProbe {
            seen,
            confirmations,
        }) = probe(&txid)
        else {
            continue;
        };
        if let Some(record) = observations.get_mut(&txid) {
            if confirmations > 0 || seen {
                record.relayed = true;
                record.confirmations = confirmations;
                record.last_probed_at = now;
                record.never_seen_probes = 0;
                if stampable_hosts.contains(&txid) {
                    stamp_host_if_final(snapshot, watches, &txid, confirmations, now);
                }
            } else if apply_absent_probe(record, now) {
                delete_txids.push(txid);
            }
        } else if stampable_hosts.contains(&txid) {
            stamp_host_if_final(snapshot, watches, &txid, confirmations, now);
        }
    }

    for txid in delete_txids {
        observations.remove(&txid);
    }

    observations.retain(|txid, _| !observation_all_snapshot_vouts_spent(snapshot, txid));
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
    pub(crate) async fn reconcile_host_tx_finality(&self) -> ArkResult<()> {
        let Some(mut snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() else {
            return Ok(());
        };
        let mut observations = self.wallet_db.host_tx_observations();
        let pending = self.wallet_db.pending_exit_deductions();
        let mut watches = self.wallet_db.unilateral_exit_watches();
        let txids = host_txids_to_probe(&snapshot, &observations, &pending)?;
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
            &mut watches,
            now,
            |txid| probes.get(txid).copied(),
        )?;
        self.wallet_db.set_offchain_vtxo_snapshot(snapshot);
        self.wallet_db.set_host_tx_observations(observations);
        self.wallet_db.set_unilateral_exit_watches(watches);
        Ok(())
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
mod tests {
    use super::*;
    use crate::persistence::{
        HostTxObservationRecord, UnilateralExitMaterialsRecord, VirtualTxOutPointRecord,
        insert_host_tx_observation,
    };
    use crate::unilateral_exit_materials::{store_materials_for_leaf_tx, vtxo_chains_to_json};
    use ark_core::server::{ChainedTxType, VtxoChain, VtxoChains};
    use bitcoin::Txid;
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

    fn vtxo_record(host: &Txid, vout: u32) -> VirtualTxOutPointRecord {
        VirtualTxOutPointRecord {
            txid: host.to_string(),
            vout,
            created_at: 1,
            expires_at: 2,
            amount_sats: 1_000,
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
                vtxo_record(&tree, 0),
                vtxo_record(&tree, 1),
                vtxo_record(&leaf, 0),
                vtxo_record(&commitment, 0),
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

    fn record_is_unrolled(snapshot: &OffchainVtxoSnapshot, host: &Txid, vout: u32) -> bool {
        snapshot
            .virtual_tx_outpoints
            .iter()
            .find(|record| record.txid == host.to_string() && record.vout == vout)
            .map(|record| record.is_unrolled)
            .expect("vtxo record")
    }

    fn pending_for_leaf(leaf: &Txid) -> Vec<PendingExitDeductionRecord> {
        vec![PendingExitDeductionRecord {
            kind: PendingExitKind::Unilateral,
            vtxo_txid: Some(leaf.to_string()),
            vout: Some(0),
            amount_sats: 1_000,
            started_at: 1,
            baseline_offchain_spendable_sats: None,
            retain_until_spendable_drops: false,
        }]
    }

    fn reconcile_with_uniform_confs(
        snapshot: &mut OffchainVtxoSnapshot,
        observations: &mut BTreeMap<String, HostTxObservationRecord>,
        pending: &[PendingExitDeductionRecord],
        watches: &mut Vec<UnilateralExitWatchRecord>,
        now: i64,
        confirmations: u64,
        seen: bool,
    ) {
        reconcile_host_tx_finality_state(snapshot, observations, pending, watches, now, |_| {
            Some(HostTxProbe {
                seen,
                confirmations,
            })
        })
        .expect("reconcile");
    }

    #[test]
    fn register_host_tx_observation_writes_row() {
        let mut observations = BTreeMap::new();
        insert_host_tx_observation(&mut observations, "aa", 1_700_000_000);
        let row = observations.get("aa").expect("row");
        assert_eq!(row.registered_at, 1_700_000_000);
        assert!(!row.relayed);
        assert_eq!(row.confirmations, 0);
        assert_eq!(row.never_seen_probes, 0);
        assert_eq!(row.last_probed_at, 0);
    }

    #[test]
    fn re_register_host_tx_observation_resets_probe_window() {
        let mut observations = BTreeMap::new();
        observations.insert(
            "aa".to_string(),
            HostTxObservationRecord {
                registered_at: 10,
                relayed: true,
                confirmations: 2,
                never_seen_probes: 3,
                last_probed_at: 99,
            },
        );
        insert_host_tx_observation(&mut observations, "aa", 50);
        let row = observations.get("aa").expect("row");
        assert_eq!(row.registered_at, 50);
        assert!(!row.relayed);
        assert_eq!(row.confirmations, 0);
        assert_eq!(row.never_seen_probes, 0);
        assert_eq!(row.last_probed_at, 0);
    }

    #[test]
    fn unified_stamp_does_not_unroll_at_zero_confirmations() {
        let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let pending = pending_for_leaf(&leaf);
        let mut observations = BTreeMap::new();
        let mut watches = Vec::new();
        reconcile_with_uniform_confs(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut watches,
            0,
            0,
            false,
        );
        assert!(!record_is_unrolled(&snapshot, &tree, 0));
        assert!(!record_is_unrolled(&snapshot, &leaf, 0));
    }

    #[test]
    fn unified_stamp_does_not_unroll_at_five_confirmations() {
        let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let pending = pending_for_leaf(&leaf);
        let mut observations = BTreeMap::new();
        let mut watches = Vec::new();
        reconcile_with_uniform_confs(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut watches,
            0,
            5,
            true,
        );
        assert!(!record_is_unrolled(&snapshot, &tree, 0));
        assert!(!record_is_unrolled(&snapshot, &leaf, 0));
    }

    #[test]
    fn unified_stamp_unrolls_intermediate_and_terminal_at_six() {
        let (mut snapshot, tree, leaf, commitment) = snapshot_with_intermediate_tree_and_ark_leaf();
        let pending = pending_for_leaf(&leaf);
        let mut observations = BTreeMap::new();
        let mut watches = Vec::new();
        reconcile_with_uniform_confs(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut watches,
            0,
            6,
            true,
        );
        assert!(record_is_unrolled(&snapshot, &tree, 0));
        assert!(record_is_unrolled(&snapshot, &tree, 1));
        assert!(record_is_unrolled(&snapshot, &leaf, 0));
        assert!(!record_is_unrolled(&snapshot, &commitment, 0));
    }

    #[test]
    fn unified_stamp_skips_checkpoint_and_commitment() {
        let commitment = txid(0x11);
        let tree = txid(0x12);
        let checkpoint = txid(0x13);
        let leaf = txid(0x14);
        let chains = VtxoChains {
            inner: vec![
                chain(commitment, ChainedTxType::Commitment, vec![]),
                chain(tree, ChainedTxType::Tree, vec![commitment]),
                chain(checkpoint, ChainedTxType::Checkpoint, vec![tree]),
                chain(leaf, ChainedTxType::Ark, vec![checkpoint]),
            ],
        };
        let chain_json = vtxo_chains_to_json(&chains).expect("encode");
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![
                vtxo_record(&commitment, 0),
                vtxo_record(&tree, 0),
                vtxo_record(&checkpoint, 0),
                vtxo_record(&leaf, 0),
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
        let pending = pending_for_leaf(&leaf);
        let mut observations = BTreeMap::new();
        let mut watches = Vec::new();
        reconcile_with_uniform_confs(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut watches,
            0,
            6,
            true,
        );
        assert!(!record_is_unrolled(&snapshot, &commitment, 0));
        assert!(!record_is_unrolled(&snapshot, &checkpoint, 0));
        assert!(record_is_unrolled(&snapshot, &tree, 0));
        assert!(record_is_unrolled(&snapshot, &leaf, 0));
    }

    #[test]
    fn unified_stamp_enriches_watches_for_all_vouts() {
        let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let pending = pending_for_leaf(&leaf);
        let mut observations = BTreeMap::new();
        let mut watches = Vec::new();
        reconcile_with_uniform_confs(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut watches,
            42,
            6,
            true,
        );
        let tree_watches: Vec<_> = watches
            .iter()
            .filter(|watch| watch.vtxo_txid == tree.to_string())
            .collect();
        assert_eq!(tree_watches.len(), 2);
        assert!(
            tree_watches
                .iter()
                .all(|watch| watch.published_vtxo_txid.as_deref() == Some(&tree.to_string()))
        );
        let leaf_watch = watches
            .iter()
            .find(|watch| watch.vtxo_txid == leaf.to_string() && watch.vout == 0)
            .expect("leaf watch");
        assert_eq!(
            leaf_watch.published_vtxo_txid.as_deref(),
            Some(leaf.to_string().as_str())
        );
    }

    #[test]
    fn never_seen_miss_before_ten_minutes_does_not_count() {
        let (mut snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut observations = BTreeMap::new();
        observations.insert(
            leaf.to_string(),
            HostTxObservationRecord {
                registered_at: 0,
                relayed: false,
                confirmations: 0,
                never_seen_probes: 0,
                last_probed_at: 0,
            },
        );
        let pending = pending_for_leaf(&leaf);
        let mut watches = Vec::new();
        reconcile_host_tx_finality_state(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut watches,
            HOST_TX_NEVER_SEEN_FIRST_PROBE_AFTER_SECS - 1,
            |_| {
                Some(HostTxProbe {
                    seen: false,
                    confirmations: 0,
                })
            },
        )
        .expect("reconcile");
        let row = observations.get(&leaf.to_string()).expect("kept");
        assert_eq!(row.never_seen_probes, 0);
    }

    #[test]
    fn never_seen_time_skip_counts_one_miss() {
        let (mut snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut observations = BTreeMap::new();
        observations.insert(
            leaf.to_string(),
            HostTxObservationRecord {
                registered_at: 0,
                relayed: false,
                confirmations: 0,
                never_seen_probes: 0,
                last_probed_at: 0,
            },
        );
        let pending = pending_for_leaf(&leaf);
        let mut watches = Vec::new();
        reconcile_host_tx_finality_state(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut watches,
            3_600,
            |_| {
                Some(HostTxProbe {
                    seen: false,
                    confirmations: 0,
                })
            },
        )
        .expect("reconcile");
        let row = observations.get(&leaf.to_string()).expect("kept");
        assert_eq!(row.never_seen_probes, 1);
        assert_eq!(row.last_probed_at, 3_600);
    }

    #[test]
    fn never_seen_five_eligible_misses_deletes_observation() {
        let (mut snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut observations = BTreeMap::new();
        observations.insert(
            leaf.to_string(),
            HostTxObservationRecord {
                registered_at: 0,
                relayed: false,
                confirmations: 0,
                never_seen_probes: 0,
                last_probed_at: 0,
            },
        );
        let pending = pending_for_leaf(&leaf);
        let mut watches = Vec::new();
        let mut now = HOST_TX_NEVER_SEEN_FIRST_PROBE_AFTER_SECS;
        for _ in 0..HOST_TX_NEVER_SEEN_MAX_ELIGIBLE_MISSES {
            reconcile_host_tx_finality_state(
                &mut snapshot,
                &mut observations,
                &pending,
                &mut watches,
                now,
                |_| {
                    Some(HostTxProbe {
                        seen: false,
                        confirmations: 0,
                    })
                },
            )
            .expect("reconcile");
            now += HOST_TX_NEVER_SEEN_PROBE_SPACING_SECS;
        }
        assert!(!observations.contains_key(&leaf.to_string()));
        assert_eq!(pending[0].amount_sats, 1_000);
    }

    #[test]
    fn never_seen_does_not_clear_pending_deductions() {
        let (mut snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let mut observations = BTreeMap::new();
        observations.insert(
            leaf.to_string(),
            HostTxObservationRecord {
                registered_at: 0,
                relayed: false,
                confirmations: 0,
                never_seen_probes: HOST_TX_NEVER_SEEN_MAX_ELIGIBLE_MISSES - 1,
                last_probed_at: 0,
            },
        );
        let pending = pending_for_leaf(&leaf);
        let mut watches = Vec::new();
        reconcile_host_tx_finality_state(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut watches,
            HOST_TX_NEVER_SEEN_PROBE_SPACING_SECS,
            |_| {
                Some(HostTxProbe {
                    seen: false,
                    confirmations: 0,
                })
            },
        )
        .expect("reconcile");
        assert!(
            pending
                .iter()
                .any(|record| { record.vtxo_txid.as_deref() == Some(leaf.to_string().as_str()) })
        );
        assert!(!observations.contains_key(&leaf.to_string()));
    }

    #[test]
    fn heal_stamps_six_conf_host_without_inserting_observation() {
        let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        let pending = pending_for_leaf(&leaf);
        let mut observations = BTreeMap::new();
        let mut watches = Vec::new();
        reconcile_with_uniform_confs(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut watches,
            0,
            6,
            true,
        );
        assert!(observations.is_empty());
        assert!(record_is_unrolled(&snapshot, &tree, 0));
        assert!(record_is_unrolled(&snapshot, &leaf, 0));
    }

    #[test]
    fn observation_deleted_when_all_vouts_spent() {
        let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
        for record in &mut snapshot.virtual_tx_outpoints {
            if record.txid == tree.to_string() {
                record.is_spent = true;
                record.is_unrolled = true;
            }
        }
        let mut observations = BTreeMap::new();
        observations.insert(
            tree.to_string(),
            HostTxObservationRecord {
                registered_at: 1,
                relayed: true,
                confirmations: 6,
                never_seen_probes: 0,
                last_probed_at: 1,
            },
        );
        let pending = pending_for_leaf(&leaf);
        let mut watches = Vec::new();
        reconcile_host_tx_finality_state(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut watches,
            10,
            |txid| {
                if txid == tree.to_string() {
                    Some(HostTxProbe {
                        seen: true,
                        confirmations: 6,
                    })
                } else {
                    Some(HostTxProbe {
                        seen: false,
                        confirmations: 0,
                    })
                }
            },
        )
        .expect("reconcile");
        assert!(!observations.contains_key(&tree.to_string()));
    }
}
