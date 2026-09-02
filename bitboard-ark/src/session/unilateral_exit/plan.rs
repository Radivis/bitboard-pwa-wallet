use std::collections::{BTreeSet, HashMap, HashSet};

use ark_core::build_unilateral_exit_tree_txids;
use ark_core::server::VtxoChains;
use bitcoin::{Transaction, Txid};

use crate::api_types::{
    UnilateralExitBatchEstimateDto, UnilateralExitBatchEstimateParams, UnilateralExitTopologyDto,
    UnilateralExitTopologyParams,
};
use crate::constants::{
    MIN_FEE_RATE_SAT_PER_VB, UNILATERAL_EXIT_BUMP_CHILD_NESTED_P2WSH_INPUT_WEIGHT,
    UNILATERAL_EXIT_BUMP_CHILD_P2TR_KEYSPEND_INPUT_WEIGHT,
    UNILATERAL_EXIT_BUMP_CHILD_P2TR_OUTPUT_WEIGHT,
};
use crate::error::{ArkResult, ArkWasmError};
use crate::outpoint::VirtualOutPoint;
use crate::persistence::VirtualTxOutPointRecord;
use crate::unilateral_exit_materials::{chained_tx_type_label, record_is_exit_eligible};

use super::snapshot_ops::dedup_virtual_outpoints;
use super::topology::{
    merge_topology_nodes_from_chains, terminal_vtxo_host_txids_for_topology,
    topology_host_outpoints, topology_leaf_outpoints, virtual_tx_type_hosts_exit_outpoints,
};
use crate::session::ArkSession;

pub(crate) struct LeafUnilateralContext {
    pub(crate) leaf_txid: Txid,
    pub(crate) sibling_outpoints: Vec<VirtualOutPoint>,
    pub(crate) chains: VtxoChains,
    pub(crate) branch_txids: Vec<Txid>,
    pub(crate) commitment_txids: Vec<Txid>,
    #[allow(dead_code)]
    pub(crate) amount_sats: u64,
}

pub(crate) struct UnilateralBatchPlan {
    pub(crate) leaves: Vec<LeafUnilateralContext>,
    pub(crate) ordered_step_txids: Vec<Txid>,
    pub(crate) tx_by_id: HashMap<Txid, Transaction>,
}

/// Merge per-leaf exit branches into one serial order, deduping shared virtual txs.
pub(crate) fn merge_exit_branch_txids(
    branch_lists: &[Vec<Txid>],
    tx_by_id: &HashMap<Txid, Transaction>,
) -> Vec<Txid> {
    let mut universe = Vec::new();
    let mut seen = HashSet::new();
    for branch in branch_lists {
        for txid in branch {
            if seen.insert(*txid) {
                universe.push(*txid);
            }
        }
    }
    topological_order_step_txids(&universe, tx_by_id)
}

fn topological_order_step_txids(
    universe: &[Txid],
    tx_by_id: &HashMap<Txid, Transaction>,
) -> Vec<Txid> {
    let universe_set: HashSet<Txid> = universe.iter().copied().collect();
    let mut remaining_parents: HashMap<Txid, HashSet<Txid>> = universe
        .iter()
        .map(|txid| (*txid, HashSet::new()))
        .collect();
    for txid in universe {
        let Some(transaction) = tx_by_id.get(txid) else {
            continue;
        };
        for input in &transaction.input {
            let parent_txid = input.previous_output.txid;
            if universe_set.contains(&parent_txid)
                && let Some(parents) = remaining_parents.get_mut(txid)
            {
                parents.insert(parent_txid);
            }
        }
    }

    let mut ready: BTreeSet<Txid> = remaining_parents
        .iter()
        .filter(|(_, parents)| parents.is_empty())
        .map(|(txid, _)| *txid)
        .collect();
    let mut ordered = Vec::with_capacity(universe.len());
    while let Some(txid) = ready.pop_first() {
        ordered.push(txid);
        for (child_txid, parents) in remaining_parents.iter_mut() {
            if parents.remove(&txid) && parents.is_empty() {
                ready.insert(*child_txid);
            }
        }
    }
    if ordered.len() < universe.len() {
        let mut leftover: Vec<Txid> = universe
            .iter()
            .copied()
            .filter(|txid| !ordered.contains(txid))
            .collect();
        leftover.sort();
        ordered.extend(leftover);
    }
    ordered
}

/// Mirrors ark-core [`build_anchor_tx`] package feerate targeting (parent + P2A bump child).
pub(crate) fn estimate_unilateral_exit_package_fee_sats(
    parent: &Transaction,
    fee_rate_sat_per_vb: f64,
) -> u64 {
    let child_vsize = (UNILATERAL_EXIT_BUMP_CHILD_NESTED_P2WSH_INPUT_WEIGHT
        + UNILATERAL_EXIT_BUMP_CHILD_P2TR_KEYSPEND_INPUT_WEIGHT
        + UNILATERAL_EXIT_BUMP_CHILD_P2TR_OUTPUT_WEIGHT)
        .div_ceil(4);
    let package_vsize = child_vsize + parent.weight().to_vbytes_ceil();
    (package_vsize as f64 * fee_rate_sat_per_vb).ceil() as u64
}
fn sum_package_fees_for_steps(
    ordered_step_txids: &[Txid],
    tx_by_id: &HashMap<Txid, Transaction>,
    fee_rate_sat_per_vb: f64,
    start_index: usize,
) -> u64 {
    ordered_step_txids
        .iter()
        .skip(start_index)
        .filter_map(|txid| tx_by_id.get(txid))
        .map(|parent| estimate_unilateral_exit_package_fee_sats(parent, fee_rate_sat_per_vb))
        .sum()
}

/// Sibling VTXO outpoints on the same virtual leaf tx share one unroll branch.
pub(crate) fn group_virtual_outpoints_by_leaf_txid(
    outpoints: &[VirtualOutPoint],
) -> Vec<(Txid, Vec<VirtualOutPoint>)> {
    let mut groups: HashMap<Txid, Vec<VirtualOutPoint>> = HashMap::new();
    for outpoint in outpoints {
        groups
            .entry(outpoint.txid)
            .or_default()
            .push(outpoint.clone());
    }

    let mut grouped = Vec::new();
    for (leaf_txid, mut siblings) in groups {
        siblings.sort_by_key(|outpoint| outpoint.vout);
        grouped.push((leaf_txid, siblings));
    }
    grouped.sort_by(|(left, _), (right, _)| left.cmp(right));
    grouped
}

pub(crate) fn branch_txids_for_leaf(chains: &VtxoChains, leaf_txid: Txid) -> ArkResult<Vec<Txid>> {
    let paths = build_unilateral_exit_tree_txids(chains, leaf_txid)
        .map_err(|error| ArkWasmError::Client(ark_client::Error::wallet(error.to_string())))?;
    Ok(paths.into_iter().flatten().collect())
}
fn commitment_txids_from_chains(chains: &VtxoChains) -> Vec<Txid> {
    chains
        .inner
        .iter()
        .filter(|link| chained_tx_type_label(&link.tx_type) == "commitment")
        .map(|link| link.txid)
        .collect()
}

pub(crate) fn exit_eligible_records_for_topology_hosts_from_snapshot(
    snapshot: Option<&crate::persistence::OffchainVtxoSnapshot>,
    host_txids: &HashSet<String>,
) -> Vec<VirtualTxOutPointRecord> {
    if host_txids.is_empty() {
        return Vec::new();
    }
    let Some(snapshot) = snapshot else {
        return Vec::new();
    };
    snapshot
        .virtual_tx_outpoints
        .iter()
        .filter(|record| record_is_exit_eligible(record) && host_txids.contains(&record.txid))
        .cloned()
        .collect()
}

impl ArkSession {
    pub async fn get_unilateral_exit_topology(
        &self,
        params: UnilateralExitTopologyParams,
    ) -> ArkResult<UnilateralExitTopologyDto> {
        let virtual_outpoints = self
            .resolve_control_outpoints(params.vtxo_outpoints.clone())
            .await?;
        match self
            .unilateral_exit_topology_from_outpoints(virtual_outpoints.clone())
            .await
        {
            Ok(topology) => Ok(topology),
            Err(ArkWasmError::AutonomousExitMaterialsMissing)
                if !params.vtxo_outpoints.is_empty() =>
            {
                let fallback = self.resolve_control_outpoints(Vec::new()).await?;
                self.unilateral_exit_topology_from_outpoints(fallback).await
            }
            Err(error) => Err(error),
        }
    }

    async fn unilateral_exit_topology_from_outpoints(
        &self,
        virtual_outpoints: Vec<VirtualOutPoint>,
    ) -> ArkResult<UnilateralExitTopologyDto> {
        let plan = self.build_unilateral_batch_plan(&virtual_outpoints).await?;
        let nodes = merge_topology_nodes_from_chains(plan.leaves.iter().map(|leaf| &leaf.chains));
        let all_outpoints: Vec<VirtualOutPoint> = plan
            .leaves
            .iter()
            .flat_map(|leaf| leaf.sibling_outpoints.iter().cloned())
            .collect();
        let terminal_host_txids = terminal_vtxo_host_txids_for_topology(&nodes);
        let wallet_snapshot = self.wallet_db.snapshot();
        let host_outpoint_records = wallet_snapshot
            .offchain_vtxo_snapshot
            .as_ref()
            .map(|snapshot| snapshot.virtual_tx_outpoints.as_slice())
            .unwrap_or(&[]);
        let host_outpoints = topology_host_outpoints(&nodes, host_outpoint_records);
        Ok(UnilateralExitTopologyDto {
            nodes,
            leaf_outpoints: topology_leaf_outpoints(&all_outpoints, &terminal_host_txids),
            host_outpoints,
            exit_branch_txids: plan
                .ordered_step_txids
                .iter()
                .map(|txid| txid.to_string())
                .collect(),
            commitment_txids: plan
                .leaves
                .iter()
                .flat_map(|leaf| leaf.commitment_txids.iter().copied())
                .collect::<HashSet<_>>()
                .into_iter()
                .map(|txid| txid.to_string())
                .collect(),
        })
    }

    pub(super) async fn exit_eligible_records_for_topology_hosts(
        &self,
        nodes: &[crate::api_types::UnilateralExitTopologyNodeDto],
    ) -> ArkResult<Vec<VirtualTxOutPointRecord>> {
        let host_txids: HashSet<String> = nodes
            .iter()
            .filter(|node| virtual_tx_type_hosts_exit_outpoints(&node.tx_type))
            .map(|node| node.txid.clone())
            .collect();
        Ok(exit_eligible_records_for_topology_hosts_from_snapshot(
            self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref(),
            &host_txids,
        ))
    }

    pub async fn estimate_unilateral_exit_batch(
        &self,
        params: UnilateralExitBatchEstimateParams,
    ) -> ArkResult<UnilateralExitBatchEstimateDto> {
        if params.vtxo_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }

        let virtual_outpoints = dedup_virtual_outpoints(params.vtxo_outpoints);
        let bumper_balance_sats = self.onchain_bumper_info().await?.balance_sats;
        let fee_rate_sat_per_vb = params
            .fee_rate_sat_per_vb
            .unwrap_or(MIN_FEE_RATE_SAT_PER_VB)
            .max(MIN_FEE_RATE_SAT_PER_VB);

        let plan = match self.build_unilateral_batch_plan(&virtual_outpoints).await {
            Ok(plan) => plan,
            Err(ArkWasmError::AutonomousExitMaterialsMissing) => {
                return Ok(UnilateralExitBatchEstimateDto {
                    projected_unroll_steps: 0,
                    estimated_package_fee_sats: 0,
                    fee_rate_sat_per_vb,
                    bumper_balance_sats,
                    bumper_sufficient: false,
                    estimate_error: Some(
                        "Exit materials not prefetched for one or more VTXOs".to_string(),
                    ),
                });
            }
            Err(error) => return Err(error),
        };

        let projected_unroll_steps = plan.ordered_step_txids.len().max(1) as u32;
        let estimated_package_fee_sats = sum_package_fees_for_steps(
            &plan.ordered_step_txids,
            &plan.tx_by_id,
            fee_rate_sat_per_vb,
            0,
        );

        self.client.blockchain().prepare_confirmation_scan().await;
        let (first_incomplete, live_estimate_error) = match self
            .first_incomplete_step_index(self.client.blockchain(), &plan.ordered_step_txids)
            .await
        {
            Ok(index) => (index, None),
            Err(error) => (0, Some(error.to_string())),
        };
        let remaining_steps = plan
            .ordered_step_txids
            .len()
            .saturating_sub(first_incomplete);
        let estimated_remaining_fee_sats = sum_package_fees_for_steps(
            &plan.ordered_step_txids,
            &plan.tx_by_id,
            fee_rate_sat_per_vb,
            first_incomplete,
        );
        let bumper_sufficient = live_estimate_error.is_none()
            && (remaining_steps == 0 || bumper_balance_sats >= estimated_remaining_fee_sats);

        Ok(UnilateralExitBatchEstimateDto {
            projected_unroll_steps,
            estimated_package_fee_sats,
            fee_rate_sat_per_vb,
            bumper_balance_sats,
            bumper_sufficient,
            estimate_error: live_estimate_error,
        })
    }
    async fn resolve_control_outpoints(
        &self,
        virtual_outpoints: Vec<VirtualOutPoint>,
    ) -> ArkResult<Vec<VirtualOutPoint>> {
        if !virtual_outpoints.is_empty() {
            return Ok(dedup_virtual_outpoints(virtual_outpoints));
        }
        let candidates = self.list_exit_candidates().await?;
        let startable = candidates
            .into_iter()
            .filter(|candidate| candidate.can_start_unroll)
            .map(|candidate| VirtualOutPoint::parse(&candidate.txid, candidate.vout))
            .collect::<ArkResult<Vec<_>>>()?;
        if !startable.is_empty() {
            return Ok(dedup_virtual_outpoints(startable));
        }
        let in_progress = self.unilateral_exit_in_progress_outpoints()?;
        if in_progress.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }
        Ok(dedup_virtual_outpoints(
            in_progress
                .into_iter()
                .map(VirtualOutPoint::from_bitcoin_outpoint)
                .collect(),
        ))
    }

    pub(super) async fn build_unilateral_batch_plan(
        &self,
        virtual_outpoints: &[VirtualOutPoint],
    ) -> ArkResult<UnilateralBatchPlan> {
        if virtual_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }

        let mut leaves = Vec::new();
        let mut branch_lists = Vec::new();
        let mut tx_by_id = HashMap::new();

        for (leaf_txid, sibling_outpoints) in
            group_virtual_outpoints_by_leaf_txid(virtual_outpoints)
        {
            let snapshot = self
                .wallet_db
                .snapshot()
                .offchain_vtxo_snapshot
                .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?;
            crate::unilateral_exit_materials::require_unilateral_exit_materials_for_leaf_tx(
                &snapshot,
                &leaf_txid.to_string(),
            )?;
            let chains = self.load_vtxo_chains_for_leaf_tx(leaf_txid).await?;
            let branch_txids = branch_txids_for_leaf(&chains, leaf_txid)?;
            let branch_txs = self.build_unilateral_branch_for_leaf_tx(leaf_txid).await?;
            for tx in &branch_txs {
                tx_by_id.insert(tx.compute_txid(), tx.clone());
            }
            let commitment_txids = commitment_txids_from_chains(&chains);
            let mut amount_sats = 0u64;
            for sibling in &sibling_outpoints {
                let vtxo_txid = sibling.txid.to_string();
                amount_sats = amount_sats.saturating_add(
                    self.vtxo_amount_sats_for_outpoint(&vtxo_txid, sibling.vout)
                        .await?,
                );
            }
            branch_lists.push(branch_txids.clone());
            leaves.push(LeafUnilateralContext {
                leaf_txid,
                sibling_outpoints,
                chains,
                branch_txids,
                commitment_txids,
                amount_sats,
            });
        }

        let ordered_step_txids = merge_exit_branch_txids(&branch_lists, &tx_by_id);
        Ok(UnilateralBatchPlan {
            leaves,
            ordered_step_txids,
            tx_by_id,
        })
    }

    async fn load_vtxo_chains_for_leaf_tx(&self, leaf_txid: Txid) -> ArkResult<VtxoChains> {
        let snapshot = self
            .wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?;
        crate::unilateral_exit_materials::vtxo_chains_from_snapshot_materials(
            &snapshot,
            &leaf_txid.to_string(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_core::server::{ChainedTxType, VtxoChain, VtxoChains};
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;
    use std::collections::{HashMap, HashSet};

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

    fn dummy_tx_spending(parents: &[Txid]) -> Transaction {
        let inputs = if parents.is_empty() {
            vec![bitcoin::TxIn {
                previous_output: bitcoin::OutPoint::null(),
                script_sig: bitcoin::ScriptBuf::new(),
                sequence: bitcoin::Sequence::MAX,
                witness: bitcoin::Witness::new(),
            }]
        } else {
            parents
                .iter()
                .map(|parent| bitcoin::TxIn {
                    previous_output: bitcoin::OutPoint {
                        txid: *parent,
                        vout: 0,
                    },
                    script_sig: bitcoin::ScriptBuf::new(),
                    sequence: bitcoin::Sequence::MAX,
                    witness: bitcoin::Witness::new(),
                })
                .collect()
        };
        Transaction {
            version: bitcoin::transaction::Version::TWO,
            lock_time: bitcoin::absolute::LockTime::ZERO,
            input: inputs,
            output: vec![],
        }
    }

    #[test]
    fn group_virtual_outpoints_by_leaf_txid_keeps_siblings_together() {
        use crate::outpoint::VirtualOutPoint;

        let leaf_txid = txid(9);
        let grouped = group_virtual_outpoints_by_leaf_txid(&[
            VirtualOutPoint::new(leaf_txid, 1),
            VirtualOutPoint::new(leaf_txid, 0),
            VirtualOutPoint::new(txid(8), 0),
        ]);
        assert_eq!(grouped.len(), 2);
        assert_eq!(grouped[0].0, txid(8));
        assert_eq!(grouped[0].1.len(), 1);
        assert_eq!(grouped[1].0, leaf_txid);
        assert_eq!(grouped[1].1.len(), 2);
        assert_eq!(grouped[1].1[0].vout, 0);
        assert_eq!(grouped[1].1[1].vout, 1);
    }

    #[test]
    fn exit_eligible_records_for_topology_hosts_from_snapshot_does_not_fallback() {
        use crate::persistence::{OffchainVtxoSnapshot, VirtualTxOutPointRecord};

        let host = txid(9).to_string();
        let empty_hosts = HashSet::from([host.clone()]);
        assert!(
            exit_eligible_records_for_topology_hosts_from_snapshot(None, &empty_hosts).is_empty()
        );

        let snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: host.clone(),
                vout: 0,
                created_at: 0,
                expires_at: 9_999_999_999,
                amount_sats: 50_000,
                script_hex: String::new(),
                is_preconfirmed: true,
                is_swept: true,
                is_unrolled: false,
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
        // Swept records are not exit-eligible; do not invent an ASP fallback.
        assert!(
            exit_eligible_records_for_topology_hosts_from_snapshot(Some(&snapshot), &empty_hosts)
                .is_empty()
        );
    }
    #[test]
    fn estimate_unilateral_exit_package_fee_includes_parent_vsize() {
        use bitcoin::absolute::LockTime;
        use bitcoin::transaction::Version;

        let mut parent = Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![],
            output: vec![],
        };
        // Pad weight so package fee exceeds the legacy 140-vB child-only estimate.
        parent.output = vec![bitcoin::TxOut {
            value: bitcoin::Amount::from_sat(1),
            script_pubkey: bitcoin::ScriptBuf::from(vec![0u8; 500]),
        }];
        let package_fee = estimate_unilateral_exit_package_fee_sats(&parent, 2.0);
        let child_only_fee = (140_f64 * 2.0).ceil() as u64;
        assert!(
            package_fee > child_only_fee,
            "package fee {package_fee} should exceed child-only {child_only_fee}"
        );
    }
    #[test]
    fn merge_exit_branch_txids_dedupes_shared_prefix() {
        let shared = vec![txid(1), txid(2)];
        let leaf_a = [shared.clone(), vec![txid(3), txid(4)]].concat();
        let leaf_b = [shared, vec![txid(5), txid(6)]].concat();
        let mut tx_by_id = HashMap::new();
        tx_by_id.insert(txid(1), dummy_tx_spending(&[]));
        tx_by_id.insert(txid(2), dummy_tx_spending(&[txid(1)]));
        tx_by_id.insert(txid(3), dummy_tx_spending(&[txid(2)]));
        tx_by_id.insert(txid(4), dummy_tx_spending(&[txid(3)]));
        tx_by_id.insert(txid(5), dummy_tx_spending(&[txid(2)]));
        tx_by_id.insert(txid(6), dummy_tx_spending(&[txid(5)]));
        let merged = merge_exit_branch_txids(&[leaf_a, leaf_b], &tx_by_id);
        assert_eq!(merged.len(), 6);
        assert_eq!(merged[0], txid(1));
        assert_eq!(merged[1], txid(2));
        assert!(merged.contains(&txid(3)));
        assert!(merged.contains(&txid(4)));
        assert!(merged.contains(&txid(5)));
        assert!(merged.contains(&txid(6)));
        let index = |needle: Txid| merged.iter().position(|txid| *txid == needle).unwrap();
        assert!(index(txid(3)) < index(txid(4)));
        assert!(index(txid(5)) < index(txid(6)));
        assert!(index(txid(2)) < index(txid(3)));
        assert!(index(txid(2)) < index(txid(5)));
    }

    #[test]
    fn merge_exit_branch_txids_keeps_parallel_checkpoints_before_merge_ark() {
        let branch_a = vec![txid(1), txid(2), txid(4)];
        let branch_b = vec![txid(1), txid(3), txid(4)];
        let mut tx_by_id = HashMap::new();
        tx_by_id.insert(txid(1), dummy_tx_spending(&[]));
        tx_by_id.insert(txid(2), dummy_tx_spending(&[txid(1)]));
        tx_by_id.insert(txid(3), dummy_tx_spending(&[txid(1)]));
        tx_by_id.insert(txid(4), dummy_tx_spending(&[txid(2), txid(3)]));
        let merged = merge_exit_branch_txids(&[branch_a, branch_b], &tx_by_id);
        assert_eq!(merged[0], txid(1));
        assert_eq!(merged[3], txid(4));
        assert!(merged[1] == txid(2) || merged[1] == txid(3));
        assert!(merged[2] == txid(2) || merged[2] == txid(3));
        assert_ne!(merged[1], merged[2]);
    }
    #[test]
    fn branch_txids_for_leaf_returns_topological_path() {
        let chains = VtxoChains {
            inner: vec![
                chain(txid(1), ChainedTxType::Commitment, vec![]),
                chain(txid(2), ChainedTxType::Tree, vec![txid(1)]),
                chain(txid(3), ChainedTxType::Ark, vec![txid(2)]),
            ],
        };
        let branch = branch_txids_for_leaf(&chains, txid(3)).expect("branch");
        assert_eq!(branch, vec![txid(2), txid(3)]);
    }

    #[test]
    fn commitment_txids_from_chains_collects_commitment_links() {
        let chains = VtxoChains {
            inner: vec![
                chain(txid(1), ChainedTxType::Commitment, vec![]),
                chain(txid(2), ChainedTxType::Tree, vec![txid(1)]),
                chain(txid(3), ChainedTxType::Commitment, vec![]),
                chain(txid(4), ChainedTxType::Ark, vec![txid(2)]),
            ],
        };
        assert_eq!(
            commitment_txids_from_chains(&chains),
            vec![txid(1), txid(3)]
        );
    }
}
