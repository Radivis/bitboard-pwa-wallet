use super::*;
use crate::persistence::{
    HostTxObservationRecord, UnilateralExitMaterialsRecord, VirtualTxOutPointRecord,
    insert_host_tx_observation, vtxo_exit_record_key,
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
    now: i64,
    confirmations: u64,
    seen: bool,
) {
    let mut vtxo_exit_records = BTreeMap::new();
    reconcile_host_tx_finality_state(
        snapshot,
        observations,
        pending,
        &mut vtxo_exit_records,
        now,
        |_| {
            Some(HostTxProbe {
                seen,
                confirmations,
            })
        },
    )
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
    reconcile_with_uniform_confs(&mut snapshot, &mut observations, &pending, 0, 0, false);
    assert!(!record_is_unrolled(&snapshot, &tree, 0));
    assert!(!record_is_unrolled(&snapshot, &leaf, 0));
}

#[test]
fn unified_stamp_clears_premature_local_unroll_below_finality() {
    let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    for record in &mut snapshot.virtual_tx_outpoints {
        if record.txid == tree.to_string() || record.txid == leaf.to_string() {
            record.is_unrolled = true;
        }
    }
    let pending = pending_for_leaf(&leaf);
    let mut observations = BTreeMap::new();
    reconcile_with_uniform_confs(&mut snapshot, &mut observations, &pending, 0, 0, false);
    assert!(!record_is_unrolled(&snapshot, &tree, 0));
    assert!(!record_is_unrolled(&snapshot, &tree, 1));
    assert!(!record_is_unrolled(&snapshot, &leaf, 0));
}

#[test]
fn unified_stamp_does_not_unroll_at_five_confirmations() {
    let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let pending = pending_for_leaf(&leaf);
    let mut observations = BTreeMap::new();
    reconcile_with_uniform_confs(&mut snapshot, &mut observations, &pending, 0, 5, true);
    assert!(!record_is_unrolled(&snapshot, &tree, 0));
    assert!(!record_is_unrolled(&snapshot, &leaf, 0));
}

#[test]
fn unified_stamp_unrolls_intermediate_and_terminal_at_six() {
    let (mut snapshot, tree, leaf, commitment) = snapshot_with_intermediate_tree_and_ark_leaf();
    let pending = pending_for_leaf(&leaf);
    let mut observations = BTreeMap::new();
    reconcile_with_uniform_confs(&mut snapshot, &mut observations, &pending, 0, 6, true);
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
    reconcile_with_uniform_confs(&mut snapshot, &mut observations, &pending, 0, 6, true);
    assert!(!record_is_unrolled(&snapshot, &commitment, 0));
    assert!(!record_is_unrolled(&snapshot, &checkpoint, 0));
    assert!(record_is_unrolled(&snapshot, &tree, 0));
    assert!(record_is_unrolled(&snapshot, &leaf, 0));
}

#[test]
fn unified_stamp_unrolls_tree_and_ark_without_watch_writes() {
    let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let pending = pending_for_leaf(&leaf);
    let mut observations = BTreeMap::new();
    reconcile_with_uniform_confs(&mut snapshot, &mut observations, &pending, 42, 6, true);
    assert!(record_is_unrolled(&snapshot, &tree, 0));
    assert!(record_is_unrolled(&snapshot, &leaf, 0));
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
    let mut vtxo_exit_records = BTreeMap::new();
    reconcile_host_tx_finality_state(
        &mut snapshot,
        &mut observations,
        &pending,
        &mut vtxo_exit_records,
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
    assert_eq!(row.last_probed_at, 0);
}

#[test]
fn never_seen_sub_spacing_polls_do_not_reset_eligible_miss_clock() {
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
    let first_miss_at = HOST_TX_NEVER_SEEN_FIRST_PROBE_AFTER_SECS;
    reconcile_with_uniform_confs(
        &mut snapshot,
        &mut observations,
        &pending,
        first_miss_at,
        0,
        false,
    );
    let row = observations.get(&leaf.to_string()).expect("kept");
    assert_eq!(row.never_seen_probes, 1);
    assert_eq!(row.last_probed_at, first_miss_at);

    for offset in [15, 30, 45] {
        reconcile_with_uniform_confs(
            &mut snapshot,
            &mut observations,
            &pending,
            first_miss_at + offset,
            0,
            false,
        );
        let row = observations.get(&leaf.to_string()).expect("kept");
        assert_eq!(row.never_seen_probes, 1);
        assert_eq!(row.last_probed_at, first_miss_at);
    }

    let second_miss_at = first_miss_at + HOST_TX_NEVER_SEEN_PROBE_SPACING_SECS;
    reconcile_with_uniform_confs(
        &mut snapshot,
        &mut observations,
        &pending,
        second_miss_at,
        0,
        false,
    );
    let row = observations.get(&leaf.to_string()).expect("kept");
    assert_eq!(row.never_seen_probes, 2);
    assert_eq!(row.last_probed_at, second_miss_at);
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
    let mut vtxo_exit_records = BTreeMap::new();
    reconcile_host_tx_finality_state(
        &mut snapshot,
        &mut observations,
        &pending,
        &mut vtxo_exit_records,
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
    let mut now = HOST_TX_NEVER_SEEN_FIRST_PROBE_AFTER_SECS;
    for _ in 0..HOST_TX_NEVER_SEEN_MAX_ELIGIBLE_MISSES {
        let mut vtxo_exit_records = BTreeMap::new();
        reconcile_host_tx_finality_state(
            &mut snapshot,
            &mut observations,
            &pending,
            &mut vtxo_exit_records,
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
    let mut vtxo_exit_records = BTreeMap::new();
    reconcile_host_tx_finality_state(
        &mut snapshot,
        &mut observations,
        &pending,
        &mut vtxo_exit_records,
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
fn never_seen_rewinds_vtxo_exit_records_to_tagged() {
    use crate::persistence::{VtxoExitPhase, VtxoExitRecord, vtxo_exit_record_key};
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
    let mut vtxo_exit_records = BTreeMap::new();
    vtxo_exit_records.insert(
        vtxo_exit_record_key(&leaf.to_string(), 0),
        VtxoExitRecord {
            phase: VtxoExitPhase::HostBroadcastAttempted,
            tagged_at: 1,
            host_txid: leaf.to_string(),
            amount_sats: 1_000,
        },
    );
    reconcile_host_tx_finality_state(
        &mut snapshot,
        &mut observations,
        &pending,
        &mut vtxo_exit_records,
        HOST_TX_NEVER_SEEN_PROBE_SPACING_SECS,
        |_| {
            Some(HostTxProbe {
                seen: false,
                confirmations: 0,
            })
        },
    )
    .expect("reconcile");
    assert!(!observations.contains_key(&leaf.to_string()));
    assert_eq!(
        vtxo_exit_records
            .get(&vtxo_exit_record_key(&leaf.to_string(), 0))
            .expect("kept")
            .phase,
        VtxoExitPhase::Tagged
    );
}

#[test]
fn heal_stamps_six_conf_host_without_inserting_observation() {
    let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let pending = pending_for_leaf(&leaf);
    let mut observations = BTreeMap::new();
    reconcile_with_uniform_confs(&mut snapshot, &mut observations, &pending, 0, 6, true);
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
    let mut vtxo_exit_records = BTreeMap::new();
    reconcile_host_tx_finality_state(
        &mut snapshot,
        &mut observations,
        &pending,
        &mut vtxo_exit_records,
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

fn confirmed_host_observation(confirmations: u64) -> HostTxObservationRecord {
    HostTxObservationRecord {
        registered_at: 1,
        relayed: true,
        confirmations,
        never_seen_probes: 0,
        last_probed_at: 1,
    }
}

fn host_confirmed_leaf_record(leaf: &Txid) -> VtxoExitRecord {
    VtxoExitRecord {
        phase: VtxoExitPhase::HostConfirmed,
        tagged_at: 1,
        host_txid: leaf.to_string(),
        amount_sats: 1_000,
    }
}

#[test]
fn reorg_five_conf_to_zero_still_seen_rewinds_to_host_relayed() {
    let (mut snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let mut observations = BTreeMap::new();
    observations.insert(leaf.to_string(), confirmed_host_observation(5));
    let mut vtxo_exit_records = BTreeMap::new();
    vtxo_exit_records.insert(
        vtxo_exit_record_key(&leaf.to_string(), 0),
        host_confirmed_leaf_record(&leaf),
    );
    let pending = Vec::new();

    reconcile_host_tx_finality_state(
        &mut snapshot,
        &mut observations,
        &pending,
        &mut vtxo_exit_records,
        10,
        |_| {
            Some(HostTxProbe {
                seen: true,
                confirmations: 0,
            })
        },
    )
    .expect("reconcile");

    let observation = observations
        .get(&leaf.to_string())
        .expect("observation kept");
    assert!(observation.relayed);
    assert_eq!(observation.confirmations, 0);
    assert_eq!(
        vtxo_exit_records
            .get(&vtxo_exit_record_key(&leaf.to_string(), 0))
            .expect("record")
            .phase,
        VtxoExitPhase::HostRelayed
    );
}

#[test]
fn reorg_one_conf_to_zero_unseen_rewinds_to_host_broadcast_attempted() {
    let (mut snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let mut observations = BTreeMap::new();
    observations.insert(leaf.to_string(), confirmed_host_observation(1));
    let mut vtxo_exit_records = BTreeMap::new();
    vtxo_exit_records.insert(
        vtxo_exit_record_key(&leaf.to_string(), 0),
        host_confirmed_leaf_record(&leaf),
    );
    let pending = Vec::new();

    reconcile_host_tx_finality_state(
        &mut snapshot,
        &mut observations,
        &pending,
        &mut vtxo_exit_records,
        10,
        |_| {
            Some(HostTxProbe {
                seen: false,
                confirmations: 0,
            })
        },
    )
    .expect("reconcile");

    let observation = observations
        .get(&leaf.to_string())
        .expect("observation kept");
    assert!(!observation.relayed);
    assert_eq!(observation.confirmations, 0);
    assert_eq!(
        vtxo_exit_records
            .get(&vtxo_exit_record_key(&leaf.to_string(), 0))
            .expect("record")
            .phase,
        VtxoExitPhase::HostBroadcastAttempted
    );
}
