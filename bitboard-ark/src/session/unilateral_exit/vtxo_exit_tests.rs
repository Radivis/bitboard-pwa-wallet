use super::*;
use crate::constants::{UNILATERAL_EXIT_LEAF_CONFIRMATIONS, UNILATERAL_EXIT_STEP_CONFIRMATIONS};
use crate::exit_balance::is_unilateral_exit_in_progress_outpoint;
use crate::persistence::{
    HostTxObservationRecord, PendingExitDeductionRecord, PendingExitKind,
    UnilateralExitWatchRecord, insert_host_tx_observation,
};
use crate::session::unilateral_exit::test_fixtures::{
    snapshot_with_intermediate_tree_and_ark_leaf, txid,
};
use bitcoin::{OutPoint, Txid};

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
    records
        .get_mut(&vtxo_exit_record_key(&leaf.to_string(), 0))
        .expect("leaf")
        .phase = VtxoExitPhase::FundingLost;
    tag_unilateral_exit_plan_in_records(
        &snapshot,
        &[VirtualOutPoint::new(leaf, 0)],
        &mut records,
        9,
    )
    .expect("retag funding_lost");
    assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::FundingLost);
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
    apply_host_observation_to_vtxo_exit_records(&mut records, &leaf.to_string(), true, 0, false);
    assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::HostRelayed);
    apply_host_observation_to_vtxo_exit_records(
        &mut records,
        &leaf.to_string(),
        true,
        u64::from(UNILATERAL_EXIT_STEP_CONFIRMATIONS),
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
fn b_rewinds_unrolled_phase_before_six_confirmations() {
    let (snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let mut records = BTreeMap::new();
    tag_unilateral_exit_plan_in_records(
        &snapshot,
        &[VirtualOutPoint::new(leaf, 0)],
        &mut records,
        1,
    )
    .expect("tag");
    records
        .get_mut(&vtxo_exit_record_key(&leaf.to_string(), 0))
        .expect("leaf")
        .phase = VtxoExitPhase::Unrolled;
    apply_host_observation_to_vtxo_exit_records(&mut records, &leaf.to_string(), true, 0, false);
    assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::HostRelayed);
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
    apply_host_observation_to_vtxo_exit_records(&mut records, &leaf.to_string(), true, 1, false);
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

#[test]
fn spend_locked_outpoints_include_funding_lost_and_not_exited() {
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
        .get_mut(&vtxo_exit_record_key(&leaf.to_string(), 0))
        .expect("leaf")
        .phase = VtxoExitPhase::FundingLost;
    records
        .get_mut(&vtxo_exit_record_key(&tree.to_string(), 0))
        .expect("tree")
        .phase = VtxoExitPhase::Exited;

    let pipeline = unilateral_exit_pipeline_outpoints(&records);
    let spend_locked = unilateral_exit_spend_locked_outpoints(&records);
    let leaf_outpoint = OutPoint {
        txid: leaf,
        vout: 0,
    };
    let tree_outpoint = OutPoint {
        txid: tree,
        vout: 0,
    };

    assert!(!pipeline.contains(&leaf_outpoint));
    assert!(!pipeline.contains(&tree_outpoint));
    assert!(spend_locked.contains(&leaf_outpoint));
    assert!(!spend_locked.contains(&tree_outpoint));
}

#[test]
fn funding_lost_outpoint_is_excluded_from_spendable_selection() {
    let (snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let mut records = BTreeMap::new();
    tag_unilateral_exit_plan_in_records(
        &snapshot,
        &[VirtualOutPoint::new(leaf, 0)],
        &mut records,
        1,
    )
    .expect("tag");
    records
        .get_mut(&vtxo_exit_record_key(&leaf.to_string(), 0))
        .expect("leaf")
        .phase = VtxoExitPhase::FundingLost;

    let excluded = unilateral_exit_spend_locked_outpoints(&records);
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
}

#[test]
fn abort_keeps_host_broadcast_attempted_and_funding_lost() {
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
    records
        .get_mut(&vtxo_exit_record_key(&leaf.to_string(), 0))
        .expect("leaf")
        .phase = VtxoExitPhase::FundingLost;
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
    assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::FundingLost);
}

#[test]
fn host_txids_on_same_materials_branch_errors_when_materials_missing() {
    let (mut snapshot, tree, _, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    snapshot.unilateral_exit_materials_by_leaf_tx.clear();
    let error = host_txids_on_same_materials_branch(&snapshot, &tree.to_string())
        .expect_err("missing exit materials must not invent a one-txid branch");
    assert!(matches!(
        error,
        ArkWasmError::AutonomousExitMaterialsMissing
    ));
}

#[test]
fn seized_branch_stamps_pre_unroll_records_funding_lost_keeps_complete_ready_sibling() {
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
        .get_mut(&vtxo_exit_record_key(&tree.to_string(), 1))
        .expect("en-passant")
        .phase = VtxoExitPhase::CompleteReady;
    let keys = pre_unroll_record_keys_on_same_branch(&snapshot, &records, &leaf.to_string(), 0)
        .expect("exit materials describe the seized branch");
    stamp_pre_unroll_records_funding_lost(&mut records, &keys);
    assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::FundingLost);
    assert_eq!(record_phase(&records, &tree, 0), VtxoExitPhase::FundingLost);
    assert_eq!(
        record_phase(&records, &tree, 1),
        VtxoExitPhase::CompleteReady
    );
}

#[test]
fn b_does_not_advance_or_rewind_funding_lost() {
    let (snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let mut records = BTreeMap::new();
    tag_unilateral_exit_plan_in_records(
        &snapshot,
        &[VirtualOutPoint::new(leaf, 0)],
        &mut records,
        1,
    )
    .expect("tag");
    records
        .get_mut(&vtxo_exit_record_key(&leaf.to_string(), 0))
        .expect("leaf")
        .phase = VtxoExitPhase::FundingLost;
    apply_host_observation_to_vtxo_exit_records(
        &mut records,
        &leaf.to_string(),
        true,
        u64::from(UNILATERAL_EXIT_LEAF_CONFIRMATIONS),
        true,
    );
    assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::FundingLost);
    rewind_records_on_host(&mut records, &leaf.to_string(), VtxoExitPhase::Tagged);
    assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::FundingLost);
}

#[test]
fn observation_deleted_when_all_vouts_exited_or_funding_lost() {
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
        .expect("tree0")
        .phase = VtxoExitPhase::Exited;
    records
        .get_mut(&vtxo_exit_record_key(&tree.to_string(), 1))
        .expect("tree1")
        .phase = VtxoExitPhase::FundingLost;
    assert!(observation_all_records_terminal(
        &records,
        &tree.to_string()
    ));
    assert!(!observation_all_records_terminal(
        &records,
        &leaf.to_string()
    ));
}

#[test]
fn heal_v10_watches_into_records_then_clears_watches() {
    let (mut snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    snapshot.virtual_tx_outpoints[0].is_unrolled = true;
    let watches = vec![UnilateralExitWatchRecord {
        vtxo_txid: tree.to_string(),
        vout: 0,
        amount_sats: 2_000,
        registered_at: 1,
        published_vtxo_txid: Some(tree.to_string()),
        branch_txids: vec![],
    }];
    let mut records = BTreeMap::new();
    heal_vtxo_exit_records_from_legacy(
        Some(&snapshot),
        &[],
        &watches,
        &BTreeMap::new(),
        &mut records,
        10,
    );
    assert_eq!(record_phase(&records, &tree, 0), VtxoExitPhase::Unrolled);
    // Heal reads leftover v10 watches into records; callers then clear watches so they
    // cannot resurrect idle rows (`heal_vtxo_exit_records`).
    let _ = leaf;
}

#[test]
fn funding_lost_is_not_completable() {
    let (snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let mut records = BTreeMap::new();
    tag_unilateral_exit_plan_in_records(
        &snapshot,
        &[VirtualOutPoint::new(leaf, 0)],
        &mut records,
        1,
    )
    .expect("tag");
    records
        .get_mut(&vtxo_exit_record_key(&leaf.to_string(), 0))
        .expect("leaf")
        .phase = VtxoExitPhase::FundingLost;
    let error = validate_records_not_funding_lost(&records, &[VirtualOutPoint::new(leaf, 0)])
        .expect_err("funding_lost is not completable");
    assert!(matches!(
        error,
        ArkWasmError::VtxoFundingLost { vout: 0, .. }
    ));
}

#[test]
fn b_scan_stamps_funding_lost_on_aborted_leftover_without_job_outpoints() {
    let (mut snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let mut records = BTreeMap::new();
    tag_unilateral_exit_plan_in_records(
        &snapshot,
        &[VirtualOutPoint::new(leaf, 0)],
        &mut records,
        1,
    )
    .expect("tag");
    for row in &mut snapshot.virtual_tx_outpoints {
        if row.txid == leaf.to_string() && row.vout == 0 {
            row.is_swept = true;
            row.is_unrolled = false;
        }
    }
    let stamped =
        stamp_pre_unroll_records_funding_lost_for_asp_swept(&snapshot, &mut records, false, |_| {
            false
        })
        .expect("exit materials describe the seized branch");
    assert!(stamped);
    assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::FundingLost);
}

#[test]
fn autonomous_mode_does_not_stamp_funding_lost_from_snapshot_swept() {
    let (mut snapshot, _, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let mut records = BTreeMap::new();
    tag_unilateral_exit_plan_in_records(
        &snapshot,
        &[VirtualOutPoint::new(leaf, 0)],
        &mut records,
        1,
    )
    .expect("tag");
    for row in &mut snapshot.virtual_tx_outpoints {
        if row.txid == leaf.to_string() && row.vout == 0 {
            row.is_swept = true;
            row.is_unrolled = false;
        }
    }
    let stamped =
        stamp_pre_unroll_records_funding_lost_for_asp_swept(&snapshot, &mut records, true, |_| {
            false
        })
        .expect("autonomous mode skips snapshot is_swept without reading materials");
    assert!(!stamped);
    assert_eq!(record_phase(&records, &leaf, 0), VtxoExitPhase::Tagged);
}

#[test]
fn list_vtxo_exit_records_dto_round_trip() {
    let (snapshot, tree, leaf, _) = snapshot_with_intermediate_tree_and_ark_leaf();
    let mut records = BTreeMap::new();
    tag_unilateral_exit_plan_in_records(
        &snapshot,
        &[VirtualOutPoint::new(leaf, 0)],
        &mut records,
        42,
    )
    .expect("tag");
    records
        .get_mut(&vtxo_exit_record_key(&tree.to_string(), 0))
        .expect("tree")
        .phase = VtxoExitPhase::Unrolled;
    let rows = vtxo_exit_record_dtos(&records);
    let tree_row = rows
        .iter()
        .find(|row| row.txid == tree.to_string() && row.vout == 0)
        .expect("tree dto");
    assert_eq!(tree_row.phase, VtxoExitPhase::Unrolled);
    assert_eq!(tree_row.tagged_at, 42);
    assert_eq!(tree_row.host_txid, tree.to_string());
    let leaf_row = rows
        .iter()
        .find(|row| row.txid == leaf.to_string() && row.vout == 0)
        .expect("leaf dto");
    assert_eq!(leaf_row.phase, VtxoExitPhase::Tagged);
    let encoded = serde_json::to_value(tree_row).expect("json");
    assert_eq!(encoded["phase"], "unrolled");
    assert_eq!(encoded["hostTxid"], tree.to_string());
    assert_eq!(encoded["amountSats"], 2_000);
}
