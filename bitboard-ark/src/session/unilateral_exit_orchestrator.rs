use std::collections::{BTreeSet, HashMap, HashSet};

use ark_core::build_unilateral_exit_tree_txids;
use ark_core::server::VtxoChains;
use bitcoin::{Transaction, Txid};

use crate::api_types::{
    ProceedUnilateralExitStepParams, ProceedUnilateralExitStepResultDto,
    UnilateralExitBatchEstimateDto, UnilateralExitBatchEstimateParams,
    UnilateralExitJobViabilityDto, UnilateralExitLeafStatusDto, UnilateralExitNodeStatusDto,
    UnilateralExitNodeStatusKind, UnilateralExitPhase, UnilateralExitProgressDto,
    UnilateralExitProgressParams, UnilateralExitTopologyDto, UnilateralExitTopologyParams,
};
use crate::constants::{
    MIN_FEE_RATE_SAT_PER_VB, UNILATERAL_EXIT_BUMP_CHILD_NESTED_P2WSH_INPUT_WEIGHT,
    UNILATERAL_EXIT_BUMP_CHILD_P2TR_KEYSPEND_INPUT_WEIGHT,
    UNILATERAL_EXIT_BUMP_CHILD_P2TR_OUTPUT_WEIGHT, UNILATERAL_EXIT_LEAF_CONFIRMATIONS,
    UNILATERAL_EXIT_STEP_CONFIRMATIONS,
};
use crate::error::{ArkResult, ArkWasmError};
use crate::esplora_blockchain::{
    EsploraBlockchain, is_package_not_child_with_unconfirmed_parents_error,
    is_redundant_unilateral_exit_broadcast_error,
};
use crate::outpoint::VirtualOutPoint;
use crate::outpoint::representative_vout_among_virtual_outpoints;
use crate::persistence::VirtualTxOutPointRecord;
use crate::unilateral_exit_materials::{chained_tx_type_label, record_is_exit_eligible};

use super::ArkSession;
use super::exit_autonomous::dedup_virtual_outpoints;
use super::exit_watch::enrich_unilateral_exit_watches_for_leaf_tx_after_unroll;
use super::open::sync_onchain_wallet_with_retries;
use super::unilateral_exit_branch_topology::{
    merge_topology_nodes_from_chains, terminal_vtxo_host_txids_for_topology,
    topology_host_outpoints, topology_leaf_outpoints, virtual_tx_type_hosts_exit_outpoints,
};
use super::unilateral_exit_job_viability::{
    detect_asp_swept_from_sources, evaluate_branch_funding_interference, viability_from_asp_swept,
    viability_ok,
};

pub(crate) struct LeafUnilateralContext {
    pub(crate) leaf_txid: Txid,
    pub(crate) sibling_outpoints: Vec<VirtualOutPoint>,
    pub(crate) chains: VtxoChains,
    pub(crate) branch_txids: Vec<Txid>,
    pub(crate) commitment_txids: Vec<Txid>,
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

fn empty_witness_input_summaries(parent: &Transaction) -> Vec<String> {
    parent
        .input
        .iter()
        .enumerate()
        .filter(|(_, input)| input.witness.is_empty())
        .map(|(index, input)| {
            format!(
                "input {index} spending {}:{}",
                input.previous_output.txid, input.previous_output.vout
            )
        })
        .collect()
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

pub(crate) fn leaf_reached_finality(confirmations: u64) -> bool {
    confirmations >= u64::from(UNILATERAL_EXIT_LEAF_CONFIRMATIONS)
}

pub(crate) fn step_reached_confirmation(confirmations: u64) -> bool {
    confirmations >= u64::from(UNILATERAL_EXIT_STEP_CONFIRMATIONS)
}

/// Submit-node override when Esplora painted a parent confirmed but `submitpackage` disagreed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum UnspendableParentState {
    NeedsBroadcast { marked_at_tip: Option<u32> },
    Broadcasted { broadcast_at_tip: Option<u32> },
}

pub(crate) fn unroll_parent_txids_in_plan(
    transaction: &Transaction,
    ordered_step_txids: &[Txid],
) -> Vec<Txid> {
    transaction
        .input
        .iter()
        .map(|input| input.previous_output.txid)
        .filter(|txid| ordered_step_txids.contains(txid))
        .collect()
}

/// Plan ancestors of `transaction`, oldest (lowest plan index) first.
/// Immediate parents are not enough for `package-not-child`: the submit node may
/// also be missing grandparents, and wrapping only the parent in a new CPFP still fails.
pub(crate) fn unroll_ancestor_txids_oldest_first(
    transaction: &Transaction,
    ordered_step_txids: &[Txid],
    tx_by_id: &HashMap<Txid, Transaction>,
) -> Vec<Txid> {
    let mut seen = HashSet::new();
    let mut stack = unroll_parent_txids_in_plan(transaction, ordered_step_txids);
    while let Some(txid) = stack.pop() {
        if !seen.insert(txid) {
            continue;
        }
        if let Some(ancestor_tx) = tx_by_id.get(&txid) {
            stack.extend(unroll_parent_txids_in_plan(ancestor_tx, ordered_step_txids));
        }
    }
    let mut ancestors: Vec<Txid> = seen.into_iter().collect();
    ancestors.sort_by_key(|txid| {
        ordered_step_txids
            .iter()
            .position(|step| step == txid)
            .unwrap_or(usize::MAX)
    });
    ancestors
}

/// Parents this wallet already submitted (`index <= wait_index`) must not be marked
/// unspendable. Without a wait stamp, any plan parent is eligible (cold-start skip).
pub(crate) fn unroll_parent_already_submitted(
    parent_index: usize,
    wait_index: Option<usize>,
) -> bool {
    wait_index.is_some_and(|wait| parent_index <= wait)
}

pub(crate) fn unroll_parent_txids_skipped_after_wait(
    parent_txids: &[Txid],
    ordered_step_txids: &[Txid],
    wait_index: Option<usize>,
) -> Vec<Txid> {
    parent_txids
        .iter()
        .copied()
        .filter(|txid| {
            ordered_step_txids
                .iter()
                .position(|step| step == txid)
                .is_some_and(|index| !unroll_parent_already_submitted(index, wait_index))
        })
        .collect()
}

pub(crate) fn unroll_parent_txs_from_plan(
    parent_txids: &[Txid],
    tx_by_id: &HashMap<Txid, Transaction>,
) -> Vec<Transaction> {
    parent_txids
        .iter()
        .filter_map(|txid| tx_by_id.get(txid).cloned())
        .collect()
}

pub(crate) fn unspendable_parent_blocks_step(
    state: Option<&UnspendableParentState>,
    current_tip: Option<u32>,
) -> bool {
    match state {
        None => false,
        Some(UnspendableParentState::NeedsBroadcast { .. }) => true,
        Some(UnspendableParentState::Broadcasted { broadcast_at_tip }) => {
            match (current_tip, *broadcast_at_tip) {
                (Some(tip), Some(broadcast_tip)) if tip > broadcast_tip => false,
                _ => true,
            }
        }
    }
}

pub(crate) fn should_force_unilateral_exit_step_broadcast(
    esplora_confirmations: u64,
    marked_unspendable: bool,
) -> bool {
    marked_unspendable || !step_reached_confirmation(esplora_confirmations)
}

/// Do not skip a step this wallet has not yet broadcast, even if Esplora paints it confirmed.
/// `wait_index` is the last step we submitted; the next index stays the cursor.
pub(crate) fn wait_cap_holds_unbroadcast_successor(
    index: usize,
    wait_index: Option<usize>,
) -> bool {
    wait_index.is_some_and(|wait| index > wait)
}

pub(crate) fn first_incomplete_step_from_confirmations(
    confirmations: &[u64],
    wait_index: Option<usize>,
) -> usize {
    for (index, &confs) in confirmations.iter().enumerate() {
        if !step_reached_confirmation(confs) {
            return index;
        }
        if wait_cap_holds_unbroadcast_successor(index, wait_index) {
            return index;
        }
    }
    confirmations.len()
}

pub(crate) fn node_status_label(
    confirmations: u64,
    is_current_step: bool,
) -> UnilateralExitNodeStatusKind {
    if step_reached_confirmation(confirmations) {
        UnilateralExitNodeStatusKind::Confirmed
    } else if is_current_step {
        UnilateralExitNodeStatusKind::InProgress
    } else {
        UnilateralExitNodeStatusKind::Pending
    }
}

/// Wait-capped successors are not complete for this wallet even if Esplora painted them.
pub(crate) fn displayed_unroll_step_confirmations(
    esplora_confirmations: u64,
    index: usize,
    wait_index: Option<usize>,
) -> u64 {
    if wait_cap_holds_unbroadcast_successor(index, wait_index) {
        0
    } else {
        esplora_confirmations
    }
}

pub(crate) fn displayed_unroll_node_status(
    esplora_confirmations: u64,
    index: usize,
    current_step_index: usize,
    wait_index: Option<usize>,
) -> UnilateralExitNodeStatusKind {
    if index == current_step_index {
        return UnilateralExitNodeStatusKind::InProgress;
    }
    if wait_cap_holds_unbroadcast_successor(index, wait_index) {
        return UnilateralExitNodeStatusKind::Pending;
    }
    node_status_label(esplora_confirmations, false)
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

#[allow(dead_code)]
fn record_from_virtual_tx_outpoint_for_topology(
    virtual_tx_outpoint: &ark_core::server::VirtualTxOutPoint,
) -> VirtualTxOutPointRecord {
    VirtualTxOutPointRecord {
        txid: virtual_tx_outpoint.outpoint.txid.to_string(),
        vout: virtual_tx_outpoint.outpoint.vout,
        created_at: virtual_tx_outpoint.created_at,
        expires_at: virtual_tx_outpoint.expires_at,
        amount_sats: virtual_tx_outpoint.amount.to_sat(),
        script_hex: hex::encode(virtual_tx_outpoint.script.as_bytes()),
        is_preconfirmed: virtual_tx_outpoint.is_preconfirmed,
        is_swept: virtual_tx_outpoint.is_swept,
        is_unrolled: virtual_tx_outpoint.is_unrolled,
        is_spent: virtual_tx_outpoint.is_spent,
        spent_by: virtual_tx_outpoint
            .spent_by
            .as_ref()
            .map(|txid| txid.to_string()),
        commitment_txids: virtual_tx_outpoint
            .commitment_txids
            .iter()
            .map(|txid| txid.to_string())
            .collect(),
        settled_by: virtual_tx_outpoint
            .settled_by
            .as_ref()
            .map(|txid| txid.to_string()),
        ark_txid: virtual_tx_outpoint
            .ark_txid
            .as_ref()
            .map(|txid| txid.to_string()),
        assets: vec![],
        server_pk_hex: None,
    }
}

impl ArkSession {
    pub async fn get_unilateral_exit_topology(
        &self,
        params: UnilateralExitTopologyParams,
    ) -> ArkResult<UnilateralExitTopologyDto> {
        let virtual_outpoints = self
            .resolve_control_outpoints(params.vtxo_outpoints)
            .await?;
        let plan = self.build_unilateral_batch_plan(&virtual_outpoints).await?;
        let nodes = merge_topology_nodes_from_chains(plan.leaves.iter().map(|leaf| &leaf.chains));
        let all_outpoints: Vec<VirtualOutPoint> = plan
            .leaves
            .iter()
            .flat_map(|leaf| leaf.sibling_outpoints.iter().cloned())
            .collect();
        let terminal_host_txids = terminal_vtxo_host_txids_for_topology(&nodes);
        let host_outpoint_records = self
            .exit_eligible_records_for_topology_hosts(&nodes)
            .await?;
        let host_outpoints = topology_host_outpoints(&nodes, &host_outpoint_records);
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

    async fn exit_eligible_records_for_topology_hosts(
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

    pub async fn proceed_unilateral_exit_step(
        &self,
        params: ProceedUnilateralExitStepParams,
    ) -> ArkResult<ProceedUnilateralExitStepResultDto> {
        if params.vtxo_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }
        let fee_rate_sat_per_vb = params.fee_rate_sat_per_vb.max(MIN_FEE_RATE_SAT_PER_VB);

        let virtual_outpoints = dedup_virtual_outpoints(params.vtxo_outpoints);
        for outpoint in &virtual_outpoints {
            let vtxo_txid = outpoint.txid.to_string();
            if !self.leaf_is_marked_unrolled(&vtxo_txid, outpoint.vout)? {
                let amount_sats = self
                    .vtxo_amount_sats_for_outpoint(&vtxo_txid, outpoint.vout)
                    .await?;
                self.record_pending_unilateral_exit(&vtxo_txid, outpoint.vout, amount_sats);
            }
        }

        let plan = self.build_unilateral_batch_plan(&virtual_outpoints).await?;
        let blockchain = self.client.blockchain();
        blockchain.prepare_confirmation_scan().await;

        let current_step_index = self
            .first_incomplete_step_index(blockchain, &plan.ordered_step_txids)
            .await?;

        if current_step_index >= plan.ordered_step_txids.len() {
            self.wallet_db.clear_unilateral_exit_step_wait();
            self.mark_unrolled_leaves_at_finality(&plan).await?;
            return self
                .build_proceed_result(
                    &plan,
                    None,
                    current_step_index,
                    UnilateralExitPhase::Complete,
                )
                .await;
        }

        let step_txid = plan.ordered_step_txids[current_step_index];
        let parent_tx = plan
            .tx_by_id
            .get(&step_txid)
            .ok_or_else(|| ArkWasmError::Snapshot(format!("missing branch tx for {step_txid}")))?
            .clone();

        let empty_witness_inputs = empty_witness_input_summaries(&parent_tx);
        if !empty_witness_inputs.is_empty() {
            return Err(ArkWasmError::Client(ark_client::Error::wallet(format!(
                "refusing to broadcast unsigned unilateral-exit inputs: {}",
                empty_witness_inputs.join("; ")
            ))));
        }

        let confirmations_before = tx_confirmations(blockchain, &step_txid).await?;
        let phase = UnilateralExitPhase::Waiting;
        let step_wait = self.wallet_db.unilateral_exit_step_wait();
        let wait_index = step_wait.as_ref().map(|record| record.step_index as usize);
        let force_unspendable = self.unroll_parent_blocks_unbroadcast_successor(
            &step_txid,
            current_step_index,
            wait_index,
        );
        let already_submitted_this_step = step_wait
            .as_ref()
            .is_some_and(|record| record.step_txid == step_txid.to_string());

        if force_unspendable || !already_submitted_this_step {
            let _ = sync_onchain_wallet_with_retries(&self.client).await;
            if let Err(error) = self
                .client
                .broadcast_unilateral_exit_step_at_fee_rate(&parent_tx, fee_rate_sat_per_vb)
                .await
            {
                if is_package_not_child_with_unconfirmed_parents_error(&error) {
                    // Same-package H12 retry cannot help: BDK was just synced, and
                    // wait-covered ancestors have empty inject lists. Leave waitingForParentData
                    // to the hydrate/Proceed path (the same path a page reload uses).
                    return Err(ArkWasmError::Client(error));
                } else {
                    let broadcast_satisfied_after_error = unilateral_exit_step_broadcast_satisfied(
                        blockchain.is_tx_relayed_on_network(&step_txid).await?,
                        &step_txid,
                        self.wallet_db.unilateral_exit_step_wait().as_ref(),
                    );
                    if !is_redundant_unilateral_exit_broadcast_error(&error)
                        && !broadcast_satisfied_after_error
                    {
                        return Err(ArkWasmError::Client(error));
                    }
                }
            }
            if force_unspendable {
                self.mark_unspendable_parent_broadcasted(
                    &step_txid,
                    blockchain.cached_tip_height(),
                );
            }

            self.wallet_db.ensure_unilateral_exit_step_wait(
                &step_txid.to_string(),
                current_step_index as u32,
            );
        } else if step_reached_confirmation(confirmations_before) {
            self.wallet_db.clear_unilateral_exit_step_wait();
        }

        self.mark_unrolled_leaves_at_finality(&plan).await?;

        self.build_proceed_result(
            &plan,
            Some(step_txid.to_string()),
            current_step_index,
            phase,
        )
        .await
    }

    pub async fn get_unilateral_exit_progress(
        &self,
        params: UnilateralExitProgressParams,
    ) -> ArkResult<UnilateralExitProgressDto> {
        if params.vtxo_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }
        let virtual_outpoints = dedup_virtual_outpoints(params.vtxo_outpoints);
        let plan = self.build_unilateral_batch_plan(&virtual_outpoints).await?;
        let blockchain = self.client.blockchain();
        blockchain.prepare_confirmation_scan().await;
        self.mark_unrolled_leaves_at_finality(&plan).await?;
        let current_step_index = self
            .first_incomplete_step_index(blockchain, &plan.ordered_step_txids)
            .await?;
        let current_step_waiting_since = self
            .current_step_waiting_since(blockchain, &plan, current_step_index)
            .await?;
        let current_step_tx_relayed = self
            .current_step_tx_relayed(blockchain, &plan, current_step_index)
            .await?;
        let phase = if current_step_index >= plan.ordered_step_txids.len() {
            UnilateralExitPhase::Complete
        } else if current_step_waiting_since.is_some() || current_step_tx_relayed {
            let step_txid = plan.ordered_step_txids[current_step_index];
            let confirmations = self
                .step_confirmations_for_unroll(blockchain, &step_txid, current_step_index)
                .await?;
            if step_reached_confirmation(confirmations) {
                UnilateralExitPhase::Idle
            } else {
                UnilateralExitPhase::Waiting
            }
        } else {
            UnilateralExitPhase::Idle
        };

        let node_statuses = self
            .node_statuses_for_plan(blockchain, &plan, current_step_index)
            .await?;
        let leaf_statuses = self.leaf_statuses_for_plan(blockchain, &plan).await?;

        Ok(UnilateralExitProgressDto {
            step_index: current_step_index.min(plan.ordered_step_txids.len()) as u32,
            total_steps: plan.ordered_step_txids.len().max(1) as u32,
            phase,
            current_step_waiting_since,
            current_step_tx_relayed,
            node_statuses,
            leaf_statuses,
        })
    }

    pub async fn evaluate_unilateral_exit_job_viability(
        &self,
        params: UnilateralExitProgressParams,
    ) -> ArkResult<UnilateralExitJobViabilityDto> {
        if params.vtxo_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }

        let job_leaf_outpoints = dedup_virtual_outpoints(params.vtxo_outpoints);
        if self.all_job_leaves_locally_unrolled(&job_leaf_outpoints)? {
            return Ok(viability_ok());
        }

        if let Some(outpoint) = detect_asp_swept_from_sources(
            &job_leaf_outpoints,
            self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref(),
            &[],
            |txid, vout| self.leaf_is_marked_unrolled(txid, vout).unwrap_or(false),
        ) {
            return Ok(viability_from_asp_swept(&outpoint));
        }

        let plan = self
            .build_unilateral_batch_plan(&job_leaf_outpoints)
            .await?;
        let nodes = merge_topology_nodes_from_chains(plan.leaves.iter().map(|leaf| &leaf.chains));
        let host_records = self
            .exit_eligible_records_for_topology_hosts(&nodes)
            .await?;
        let blockchain = self.client.blockchain();

        if let Some(viability) =
            evaluate_branch_funding_interference(blockchain, &plan, &host_records, |outpoint| {
                self.leaf_is_marked_unrolled(&outpoint.txid.to_string(), outpoint.vout)
                    .unwrap_or(false)
            })
            .await?
        {
            return Ok(viability);
        }

        Ok(viability_ok())
    }

    /// Test-only hook for native integration tests that need to simulate ASP snapshot interference.
    #[doc(hidden)]
    pub fn set_offchain_vtxo_snapshot_for_tests(
        &self,
        snapshot: crate::persistence::OffchainVtxoSnapshot,
    ) {
        self.wallet_db.set_offchain_vtxo_snapshot(snapshot);
    }

    /// Marks a job leaf VTXO as ASP-swept (not unrolled) in the persisted offchain snapshot.
    #[doc(hidden)]
    pub fn mark_job_target_asp_swept_in_offchain_snapshot_for_tests(
        &self,
        txid: &str,
        vout: u32,
    ) -> ArkResult<()> {
        let mut snapshot = self
            .wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .clone()
            .ok_or_else(|| {
                ArkWasmError::Snapshot(
                    "missing offchain vtxo snapshot for ASP sweep injection".into(),
                )
            })?;
        let record = snapshot
            .virtual_tx_outpoints
            .iter_mut()
            .find(|record| record.txid == txid && record.vout == vout)
            .ok_or_else(|| {
                ArkWasmError::Snapshot(format!(
                    "vtxo {txid}:{vout} not found in offchain snapshot for ASP sweep injection"
                ))
            })?;
        record.is_swept = true;
        record.is_unrolled = false;
        self.wallet_db.set_offchain_vtxo_snapshot(snapshot);
        Ok(())
    }

    fn all_job_leaves_locally_unrolled(
        &self,
        job_leaf_outpoints: &[VirtualOutPoint],
    ) -> ArkResult<bool> {
        for outpoint in job_leaf_outpoints {
            if !self.leaf_is_marked_unrolled(&outpoint.txid.to_string(), outpoint.vout)? {
                return Ok(false);
            }
        }
        Ok(true)
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

    async fn build_unilateral_batch_plan(
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

    fn unroll_parent_blocks_step(&self, txid: &Txid) -> bool {
        let tip = self.client.blockchain().cached_tip_height();
        let mut parents = self
            .unspendable_unroll_parents
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let blocks = unspendable_parent_blocks_step(parents.get(txid), tip);
        if !blocks {
            parents.remove(txid);
        }
        blocks
    }

    fn release_unspendable_parent(&self, txid: &Txid) -> bool {
        let mut parents = self
            .unspendable_unroll_parents
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        parents.remove(txid).is_some()
    }

    /// Unspendable override only applies to steps this wallet has not already submitted.
    fn unroll_parent_blocks_unbroadcast_successor(
        &self,
        txid: &Txid,
        index: usize,
        wait_index: Option<usize>,
    ) -> bool {
        if unroll_parent_already_submitted(index, wait_index) {
            let _ = self.release_unspendable_parent(txid);
            return false;
        }
        self.unroll_parent_blocks_step(txid)
    }

    #[allow(dead_code)]
    async fn retry_step_after_unconfirmed_package_parents(
        &self,
        parent_tx: &Transaction,
        plan: &UnilateralBatchPlan,
        fee_rate_sat_per_vb: f64,
        wait_index: Option<usize>,
        _current_step_index: usize,
    ) -> ArkResult<()> {
        let plan_parents = unroll_parent_txids_in_plan(parent_tx, &plan.ordered_step_txids);
        let ancestor_txids =
            unroll_ancestor_txids_oldest_first(parent_tx, &plan.ordered_step_txids, &plan.tx_by_id);
        // Do not wrap already-submitted ancestors in a new CPFP: their P2A is spent
        // and submitpackage treats them as already-in-mempool, which is itself
        // package-not-child. Only inject plan txs this wallet has not broadcast yet.
        let ancestors_to_inject = unroll_parent_txids_skipped_after_wait(
            &ancestor_txids,
            &plan.ordered_step_txids,
            wait_index,
        );
        let ancestors = unroll_parent_txs_from_plan(&ancestors_to_inject, &plan.tx_by_id);
        let skipped = unroll_parent_txids_skipped_after_wait(
            &plan_parents,
            &plan.ordered_step_txids,
            wait_index,
        );
        for ancestor in &ancestors {
            let _ = self
                .client
                .broadcast_unilateral_exit_step_at_fee_rate(ancestor, fee_rate_sat_per_vb)
                .await;
        }
        match self
            .client
            .broadcast_unilateral_exit_step_at_fee_rate(parent_tx, fee_rate_sat_per_vb)
            .await
        {
            Ok(_) => Ok(()),
            Err(retry_error) => {
                if !skipped.is_empty() {
                    self.mark_unspendable_unroll_parents(
                        &skipped,
                        self.client.blockchain().cached_tip_height(),
                    );
                }
                Err(ArkWasmError::Client(retry_error))
            }
        }
    }

    fn mark_unspendable_unroll_parents(&self, txids: &[Txid], tip: Option<u32>) {
        let mut parents = self
            .unspendable_unroll_parents
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        for txid in txids {
            parents
                .entry(*txid)
                .or_insert(UnspendableParentState::NeedsBroadcast { marked_at_tip: tip });
        }
    }

    fn mark_unspendable_parent_broadcasted(&self, txid: &Txid, tip: Option<u32>) {
        let mut parents = self
            .unspendable_unroll_parents
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        parents.insert(
            *txid,
            UnspendableParentState::Broadcasted {
                broadcast_at_tip: tip,
            },
        );
    }

    async fn step_confirmations_for_unroll(
        &self,
        blockchain: &EsploraBlockchain,
        txid: &Txid,
        index: usize,
    ) -> ArkResult<u64> {
        let esplora_confirmations = tx_confirmations(blockchain, txid).await?;
        let wait_index = self
            .wallet_db
            .unilateral_exit_step_wait()
            .map(|record| record.step_index as usize);
        if self.unroll_parent_blocks_unbroadcast_successor(txid, index, wait_index) {
            Ok(0)
        } else {
            Ok(esplora_confirmations)
        }
    }

    async fn first_incomplete_step_index(
        &self,
        blockchain: &EsploraBlockchain,
        ordered_step_txids: &[Txid],
    ) -> ArkResult<usize> {
        let wait_index = self
            .wallet_db
            .unilateral_exit_step_wait()
            .map(|record| record.step_index as usize);
        for (index, txid) in ordered_step_txids.iter().enumerate() {
            let esplora_confirmations = tx_confirmations(blockchain, txid).await?;
            let blocked = self.unroll_parent_blocks_unbroadcast_successor(txid, index, wait_index);
            let confirmations = if blocked { 0 } else { esplora_confirmations };
            if !step_reached_confirmation(confirmations)
                || wait_cap_holds_unbroadcast_successor(index, wait_index)
            {
                return Ok(index);
            }
            blockchain.store_confirmed_at_tip(*txid, confirmations);
        }
        Ok(ordered_step_txids.len())
    }

    /// Marks leaves unrolled in the local snapshot when chain depth is reached.
    /// Does not block on operator indexer polling — that runs during operator sync.
    async fn mark_unrolled_leaves_at_finality(&self, plan: &UnilateralBatchPlan) -> ArkResult<()> {
        let blockchain = self.client.blockchain();
        let mut processed_leaf_txids = HashSet::new();

        for leaf in &plan.leaves {
            let leaf_virtual_txid = leaf.leaf_txid.to_string();
            let leaf_txid = leaf.leaf_txid;
            if !processed_leaf_txids.insert(leaf_txid) {
                continue;
            }
            if self.leaf_virtual_tx_is_marked_unrolled(&leaf_virtual_txid)? {
                continue;
            }
            if !leaf_reached_finality(tx_confirmations(blockchain, &leaf_txid).await?) {
                continue;
            }
            self.mark_leaf_virtual_tx_vtxos_unrolled_in_snapshot(&leaf_virtual_txid)?;
            enrich_unilateral_exit_watches_for_leaf_tx_after_unroll(
                &self.wallet_db,
                &leaf_virtual_txid,
                &leaf_txid.to_string(),
                &leaf.branch_txids,
            );
        }
        Ok(())
    }

    fn leaf_virtual_tx_is_marked_unrolled(&self, leaf_txid: &str) -> ArkResult<bool> {
        let snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot;
        let Some(snapshot) = snapshot else {
            return Ok(false);
        };
        Ok(snapshot
            .virtual_tx_outpoints
            .iter()
            .any(|record| record.txid == leaf_txid && record.is_unrolled))
    }

    fn leaf_is_marked_unrolled(&self, txid: &str, vout: u32) -> ArkResult<bool> {
        let snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot;
        let Some(snapshot) = snapshot else {
            return Ok(false);
        };
        Ok(snapshot
            .virtual_tx_outpoints
            .iter()
            .any(|record| record.txid == txid && record.vout == vout && record.is_unrolled))
    }

    async fn build_proceed_result(
        &self,
        plan: &UnilateralBatchPlan,
        step_txid: Option<String>,
        step_index: usize,
        phase: UnilateralExitPhase,
    ) -> ArkResult<ProceedUnilateralExitStepResultDto> {
        let blockchain = self.client.blockchain();
        let current_step_index = self
            .first_incomplete_step_index(blockchain, &plan.ordered_step_txids)
            .await?;
        let current_step_waiting_since = self
            .current_step_waiting_since(blockchain, plan, current_step_index)
            .await?;
        let current_step_tx_relayed = self
            .current_step_tx_relayed(blockchain, plan, current_step_index)
            .await?;
        let resolved_phase = if current_step_index >= plan.ordered_step_txids.len() {
            UnilateralExitPhase::Complete
        } else if current_step_waiting_since.is_some() {
            UnilateralExitPhase::Waiting
        } else {
            phase
        };
        Ok(ProceedUnilateralExitStepResultDto {
            step_txid,
            step_index: step_index as u32,
            total_steps: plan.ordered_step_txids.len().max(1) as u32,
            phase: resolved_phase,
            current_step_waiting_since,
            current_step_tx_relayed,
            node_statuses: self
                .node_statuses_for_plan(blockchain, plan, current_step_index)
                .await?,
            leaf_statuses: self.leaf_statuses_for_plan(blockchain, plan).await?,
        })
    }

    async fn node_statuses_for_plan(
        &self,
        blockchain: &EsploraBlockchain,
        plan: &UnilateralBatchPlan,
        current_step_index: usize,
    ) -> ArkResult<Vec<UnilateralExitNodeStatusDto>> {
        let wait_index = self
            .wallet_db
            .unilateral_exit_step_wait()
            .map(|record| record.step_index as usize);
        let mut statuses = Vec::new();
        for (index, txid) in plan.ordered_step_txids.iter().enumerate() {
            let esplora_confirmations = self
                .step_confirmations_for_unroll(blockchain, txid, index)
                .await?;
            statuses.push(UnilateralExitNodeStatusDto {
                txid: txid.to_string(),
                confirmations: displayed_unroll_step_confirmations(
                    esplora_confirmations,
                    index,
                    wait_index,
                ),
                status: displayed_unroll_node_status(
                    esplora_confirmations,
                    index,
                    current_step_index,
                    wait_index,
                ),
            });
        }
        Ok(statuses)
    }

    async fn leaf_statuses_for_plan(
        &self,
        blockchain: &EsploraBlockchain,
        plan: &UnilateralBatchPlan,
    ) -> ArkResult<Vec<UnilateralExitLeafStatusDto>> {
        let mut statuses = Vec::new();
        for leaf in &plan.leaves {
            let vtxo_txid = leaf.leaf_txid.to_string();
            let leaf_txid = leaf.leaf_txid;
            let representative_vout =
                representative_vout_among_virtual_outpoints(&leaf.sibling_outpoints);
            let confirmations = tx_confirmations(blockchain, &leaf_txid).await?;
            statuses.push(UnilateralExitLeafStatusDto {
                txid: vtxo_txid.clone(),
                vout: representative_vout,
                confirmations,
                is_unrolled: self.leaf_is_marked_unrolled(&vtxo_txid, representative_vout)?,
            });
        }
        Ok(statuses)
    }

    async fn current_step_waiting_since(
        &self,
        blockchain: &EsploraBlockchain,
        plan: &UnilateralBatchPlan,
        current_step_index: usize,
    ) -> ArkResult<Option<i64>> {
        if current_step_index >= plan.ordered_step_txids.len() {
            self.wallet_db.clear_unilateral_exit_step_wait();
            return Ok(None);
        }

        let step_txid = plan.ordered_step_txids[current_step_index];
        let confirmations = self
            .step_confirmations_for_unroll(blockchain, &step_txid, current_step_index)
            .await?;
        let step_wait = self.wallet_db.unilateral_exit_step_wait();
        let wait_matches_current = step_wait
            .as_ref()
            .is_some_and(|record| record.step_txid == step_txid.to_string());
        if wait_matches_current && step_reached_confirmation(confirmations) {
            self.wallet_db.clear_unilateral_exit_step_wait();
            return Ok(None);
        }

        Ok(self
            .wallet_db
            .unilateral_exit_step_wait()
            .filter(|record| record.step_txid == step_txid.to_string())
            .map(|record| record.started_at))
    }

    async fn current_step_tx_relayed(
        &self,
        blockchain: &EsploraBlockchain,
        plan: &UnilateralBatchPlan,
        current_step_index: usize,
    ) -> ArkResult<bool> {
        if current_step_index >= plan.ordered_step_txids.len() {
            return Ok(true);
        }
        let step_txid = plan.ordered_step_txids[current_step_index];
        let step_wait = self.wallet_db.unilateral_exit_step_wait();
        if step_wait
            .as_ref()
            .is_none_or(|record| record.step_txid != step_txid.to_string())
        {
            // Unbroadcast successor: Esplora `/raw` can be ASP-indexed and still unusable
            // as a submitpackage parent. Require an actual proceed.
            return Ok(false);
        }
        let raw_relayed = blockchain.is_tx_relayed_on_network(&step_txid).await?;
        Ok(unilateral_exit_step_broadcast_satisfied(
            raw_relayed,
            &step_txid,
            step_wait.as_ref(),
        ))
    }
}

/// `/raw` is the primary relay signal; regtest Esplora often keeps mempool parents at `/raw` 404
/// until mined. After `proceed_unilateral_exit_step` stamps a wait record, treat broadcast as done.
pub(crate) fn unilateral_exit_step_broadcast_satisfied(
    raw_relayed: bool,
    step_txid: &Txid,
    step_wait: Option<&crate::persistence::UnilateralExitStepWaitRecord>,
) -> bool {
    raw_relayed || step_wait.is_some_and(|record| record.step_txid == step_txid.to_string())
}

async fn tx_confirmations(blockchain: &EsploraBlockchain, txid: &Txid) -> ArkResult<u64> {
    blockchain.get_tx_confirmations(txid).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_core::server::{ChainedTxType, VtxoChain, VtxoChains};
    use bitcoin::Txid;
    use std::collections::{HashMap, HashSet};

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
    fn step_broadcast_satisfied_when_wait_record_matches_step_txid() {
        use crate::persistence::UnilateralExitStepWaitRecord;

        let step_txid = txid(42);
        let wait = UnilateralExitStepWaitRecord {
            step_txid: step_txid.to_string(),
            step_index: 0,
            started_at: 1_700_000_000,
        };
        assert!(unilateral_exit_step_broadcast_satisfied(
            false,
            &step_txid,
            Some(&wait),
        ));
        assert!(!unilateral_exit_step_broadcast_satisfied(
            false,
            &txid(43),
            Some(&wait),
        ));
        assert!(unilateral_exit_step_broadcast_satisfied(
            true, &step_txid, None
        ));
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
    fn empty_witness_input_summaries_lists_unsigned_inputs() {
        let tx = Transaction {
            version: bitcoin::transaction::Version::TWO,
            lock_time: bitcoin::absolute::LockTime::ZERO,
            input: vec![bitcoin::TxIn {
                previous_output: bitcoin::OutPoint {
                    txid: txid(9),
                    vout: 0,
                },
                script_sig: bitcoin::ScriptBuf::new(),
                sequence: bitcoin::Sequence::MAX,
                witness: bitcoin::Witness::new(),
            }],
            output: vec![],
        };
        let summaries = empty_witness_input_summaries(&tx);
        assert_eq!(summaries.len(), 1);
        assert!(summaries[0].contains("input 0"));
        assert!(summaries[0].contains(&txid(9).to_string()));
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
    fn leaf_finality_requires_six_confirmations() {
        assert!(!leaf_reached_finality(5));
        assert!(leaf_reached_finality(6));
        assert!(leaf_reached_finality(10));
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

    #[test]
    fn unroll_parent_txids_in_plan_keeps_only_branch_inputs() {
        let parent = dummy_tx_spending(&[txid(2), txid(9)]);
        assert_eq!(
            unroll_parent_txids_in_plan(&parent, &[txid(1), txid(2), txid(3)]),
            vec![txid(2)]
        );
    }

    #[test]
    fn unroll_ancestor_txids_oldest_first_walks_the_full_plan_chain() {
        let child = dummy_tx_spending(&[txid(3)]);
        let mut tx_by_id = HashMap::new();
        tx_by_id.insert(txid(1), dummy_tx_spending(&[]));
        tx_by_id.insert(txid(2), dummy_tx_spending(&[txid(1)]));
        tx_by_id.insert(txid(3), dummy_tx_spending(&[txid(2)]));
        tx_by_id.insert(txid(4), child.clone());
        assert_eq!(
            unroll_ancestor_txids_oldest_first(
                &child,
                &[txid(1), txid(2), txid(3), txid(4)],
                &tx_by_id
            ),
            vec![txid(1), txid(2), txid(3)]
        );
    }

    #[test]
    fn unroll_ancestor_txids_oldest_first_ignores_non_plan_inputs() {
        let child = dummy_tx_spending(&[txid(2), txid(9)]);
        let mut tx_by_id = HashMap::new();
        tx_by_id.insert(txid(1), dummy_tx_spending(&[]));
        tx_by_id.insert(txid(2), dummy_tx_spending(&[txid(1)]));
        tx_by_id.insert(txid(3), child.clone());
        assert_eq!(
            unroll_ancestor_txids_oldest_first(&child, &[txid(1), txid(2), txid(3)], &tx_by_id),
            vec![txid(1), txid(2)]
        );
    }

    #[test]
    fn unroll_ancestor_txids_oldest_first_orders_diamond_parents_by_plan_index() {
        let merge = dummy_tx_spending(&[txid(2), txid(3)]);
        let mut tx_by_id = HashMap::new();
        tx_by_id.insert(txid(1), dummy_tx_spending(&[]));
        tx_by_id.insert(txid(2), dummy_tx_spending(&[txid(1)]));
        tx_by_id.insert(txid(3), dummy_tx_spending(&[txid(1)]));
        tx_by_id.insert(txid(4), merge.clone());
        assert_eq!(
            unroll_ancestor_txids_oldest_first(
                &merge,
                &[txid(1), txid(2), txid(3), txid(4)],
                &tx_by_id
            ),
            vec![txid(1), txid(2), txid(3)]
        );
    }

    #[test]
    fn unroll_parent_txids_skipped_after_wait_ignores_already_submitted_parent() {
        let parents = vec![txid(1)];
        let ordered = [txid(1), txid(2), txid(3)];
        assert!(
            unroll_parent_txids_skipped_after_wait(&parents, &ordered, Some(0)).is_empty(),
            "parent at wait_index 0 was already submitted"
        );
        assert!(
            unroll_parent_txids_skipped_after_wait(&parents, &ordered, Some(1)).is_empty(),
            "parent before wait_index 1 was already submitted"
        );
        assert_eq!(
            unroll_parent_txids_skipped_after_wait(&parents, &ordered, None),
            vec![txid(1)],
            "without a wait stamp, cold-start skip still marks the parent"
        );
    }

    #[test]
    fn unroll_parent_txids_skipped_after_wait_keeps_unbroadcast_sibling() {
        let parents = vec![txid(2)];
        let ordered = [txid(1), txid(2), txid(3)];
        assert_eq!(
            unroll_parent_txids_skipped_after_wait(&parents, &ordered, Some(0)),
            vec![txid(2)]
        );
    }

    #[test]
    fn unroll_parent_txids_skipped_after_wait_drops_already_submitted_chain() {
        let ancestors = vec![txid(1), txid(2), txid(3)];
        let ordered = [txid(1), txid(2), txid(3), txid(4)];
        assert_eq!(
            unroll_parent_txids_skipped_after_wait(&ancestors, &ordered, Some(1)),
            vec![txid(3)]
        );
        assert!(unroll_parent_txids_skipped_after_wait(&ancestors, &ordered, Some(2)).is_empty());
    }

    #[test]
    fn unroll_parent_txs_from_plan_keeps_signed_parents() {
        let mut tx_by_id = HashMap::new();
        tx_by_id.insert(txid(1), dummy_tx_spending(&[]));
        tx_by_id.insert(txid(2), dummy_tx_spending(&[txid(1)]));
        let parents = vec![txid(2), txid(9)];
        let loaded = unroll_parent_txs_from_plan(&parents, &tx_by_id);
        assert_eq!(loaded.len(), 1);
        assert_eq!(
            loaded[0].compute_txid(),
            dummy_tx_spending(&[txid(1)]).compute_txid()
        );
    }

    #[test]
    fn unspendable_parent_blocks_until_broadcast_and_next_block() {
        assert!(!unspendable_parent_blocks_step(None, Some(10)));
        assert!(unspendable_parent_blocks_step(
            Some(&UnspendableParentState::NeedsBroadcast {
                marked_at_tip: Some(10)
            }),
            Some(11),
        ));
        assert!(unspendable_parent_blocks_step(
            Some(&UnspendableParentState::Broadcasted {
                broadcast_at_tip: Some(10)
            }),
            Some(10),
        ));
        assert!(!unspendable_parent_blocks_step(
            Some(&UnspendableParentState::Broadcasted {
                broadcast_at_tip: Some(10)
            }),
            Some(11),
        ));
    }

    #[test]
    fn force_broadcast_when_unspendable_even_if_esplora_confirmed() {
        assert!(should_force_unilateral_exit_step_broadcast(8, true));
        assert!(!should_force_unilateral_exit_step_broadcast(8, false));
        assert!(should_force_unilateral_exit_step_broadcast(0, false));
    }

    #[test]
    fn wait_cap_does_not_skip_sibling_checkpoint_after_last_broadcast() {
        let confs = [1, 1, 1, 1, 0];
        assert_eq!(
            first_incomplete_step_from_confirmations(&confs, Some(1)),
            2,
            "after wait at index 1, do not skip Esplora-confirmed index 2"
        );
        assert_eq!(first_incomplete_step_from_confirmations(&confs, Some(2)), 3);
        assert_eq!(
            first_incomplete_step_from_confirmations(&confs, None),
            4,
            "without a wait stamp, Esplora confs still skip to the first 0-conf"
        );
    }

    #[test]
    fn wait_cap_still_rewinds_when_an_earlier_step_drops_to_zero_conf() {
        let confs = [1, 0, 1, 1];
        assert_eq!(first_incomplete_step_from_confirmations(&confs, Some(2)), 1);
    }

    #[test]
    fn wait_capped_sibling_does_not_display_as_confirmed() {
        assert_eq!(displayed_unroll_step_confirmations(2, 4, Some(2)), 0);
        assert_eq!(
            displayed_unroll_node_status(2, 4, 3, Some(2)),
            UnilateralExitNodeStatusKind::Pending
        );
        assert_eq!(
            displayed_unroll_node_status(2, 3, 3, Some(2)),
            UnilateralExitNodeStatusKind::InProgress
        );
        assert_eq!(
            displayed_unroll_node_status(3, 2, 3, Some(2)),
            UnilateralExitNodeStatusKind::Confirmed
        );
    }
}
