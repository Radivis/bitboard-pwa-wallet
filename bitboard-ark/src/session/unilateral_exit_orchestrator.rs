use std::collections::{HashMap, HashSet};

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
use crate::esplora_blockchain::{EsploraBlockchain, is_redundant_unilateral_exit_broadcast_error};
use crate::outpoint::VirtualOutPoint;
use crate::outpoint::{
    representative_virtual_tx_outpoint_for_leaf_tx, representative_vout_among_virtual_outpoints,
};
use crate::persistence::VirtualTxOutPointRecord;
use crate::unilateral_exit_materials::{
    chained_tx_type_label, record_is_exit_eligible, snapshot_materials_for_leaf_tx,
    virtual_tx_outpoint_is_exit_eligible, vtxo_chains_from_json,
};

use super::ArkSession;
use super::exit_autonomous::dedup_virtual_outpoints;
use super::exit_watch::enrich_unilateral_exit_watches_for_leaf_tx_after_unroll;
use super::exit_watch_reconcile::ExitingVtxoReconcileOutcome;
use super::unilateral_exit_branch_topology::{
    merge_topology_nodes_from_chains, terminal_vtxo_host_txids_for_topology,
    topology_host_outpoints, topology_leaf_outpoints, virtual_tx_type_hosts_exit_outpoints,
};
use super::unilateral_exit_job_viability::{
    checkpoint_txids_on_job_branch, classify_operator_vtxo_outcome,
    detect_foreign_vtxo_outpoint_spends, exit_relevant_vtxo_outpoints_for_plan,
    viability_from_asp_swept, viability_from_branch_funding_lost, viability_ok,
    wallet_unroll_step_txids,
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
pub(crate) fn merge_exit_branch_txids(branch_lists: &[Vec<Txid>]) -> Vec<Txid> {
    let mut merged = Vec::new();
    let mut seen = HashSet::new();
    for branch in branch_lists {
        for txid in branch {
            if seen.insert(*txid) {
                merged.push(*txid);
            }
        }
    }
    merged
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

pub(crate) fn leaf_reached_finality(confirmations: u64) -> bool {
    confirmations >= u64::from(UNILATERAL_EXIT_LEAF_CONFIRMATIONS)
}

pub(crate) fn step_reached_confirmation(confirmations: u64) -> bool {
    confirmations >= u64::from(UNILATERAL_EXIT_STEP_CONFIRMATIONS)
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

fn commitment_txids_from_chains(chains: &VtxoChains) -> Vec<Txid> {
    chains
        .inner
        .iter()
        .filter(|link| chained_tx_type_label(&link.tx_type) == "commitment")
        .map(|link| link.txid)
        .collect()
}

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
        if host_txids.is_empty() {
            return Ok(Vec::new());
        }

        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref() {
            let matching_records: Vec<VirtualTxOutPointRecord> = snapshot
                .virtual_tx_outpoints
                .iter()
                .filter(|record| {
                    record_is_exit_eligible(record) && host_txids.contains(&record.txid)
                })
                .cloned()
                .collect();
            if !matching_records.is_empty() {
                return Ok(matching_records);
            }
        }

        let (vtxo_list, _) = self.client.list_vtxos().await?;
        Ok(vtxo_list
            .all()
            .filter(|virtual_tx_outpoint| {
                virtual_tx_outpoint_is_exit_eligible(virtual_tx_outpoint)
                    && host_txids.contains(&virtual_tx_outpoint.outpoint.txid.to_string())
            })
            .map(record_from_virtual_tx_outpoint_for_topology)
            .collect())
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

        let confirmations_before = tx_confirmations(blockchain, &step_txid).await?;
        let phase = UnilateralExitPhase::Waiting;
        let step_wait = self.wallet_db.unilateral_exit_step_wait();

        if !step_reached_confirmation(confirmations_before) {
            let broadcast_satisfied = unilateral_exit_step_broadcast_satisfied(
                blockchain.is_tx_relayed_on_network(&step_txid).await?,
                &step_txid,
                step_wait.as_ref(),
            );
            if !broadcast_satisfied {
                if let Err(error) = self
                    .client
                    .broadcast_unilateral_exit_step_at_fee_rate(&parent_tx, fee_rate_sat_per_vb)
                    .await
                {
                    // Esplora/mempool may reject a rebroadcast (-25/-26) while the parent is already
                    // visible; only fail when the step tx is still absent from the network.
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

            self.wallet_db.ensure_unilateral_exit_step_wait(
                &step_txid.to_string(),
                current_step_index as u32,
            );
        } else {
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
        self.mark_unrolled_leaves_at_finality(&plan).await?;
        let blockchain = self.client.blockchain();
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
            let confirmations = tx_confirmations(blockchain, &step_txid).await?;
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

        if let Some(outpoint) = self
            .detect_asp_swept_job_target(&job_leaf_outpoints)
            .await?
        {
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

        let checkpoint_txids = checkpoint_txids_on_job_branch(&nodes);
        for checkpoint_txid in &checkpoint_txids {
            let confirmations = tx_confirmations(blockchain, checkpoint_txid).await?;
            if step_reached_confirmation(confirmations) {
                return Ok(viability_from_branch_funding_lost(
                    format!(
                        "Checkpoint transaction {checkpoint_txid} is confirmed on-chain before unroll completed."
                    ),
                    vec![VirtualOutPoint::new(*checkpoint_txid, 0)],
                ));
            }
        }

        let monitored_outpoints = exit_relevant_vtxo_outpoints_for_plan(&plan, &host_records);
        let allowed_spend_txids = wallet_unroll_step_txids(&plan);
        let foreign_outpoint = detect_foreign_vtxo_outpoint_spends(
            blockchain,
            &monitored_outpoints,
            &allowed_spend_txids,
            |outpoint| {
                self.leaf_is_marked_unrolled(&outpoint.txid.to_string(), outpoint.vout)
                    .unwrap_or(false)
            },
        )
        .await?;
        if let Some(outpoint) = foreign_outpoint {
            return Ok(viability_from_branch_funding_lost(
                format!(
                    "Exit-relevant VTXO outpoint {}:{} was spent by a transaction outside the wallet unroll chain.",
                    outpoint.txid, outpoint.vout
                ),
                vec![outpoint],
            ));
        }

        Ok(viability_ok())
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

    async fn detect_asp_swept_job_target(
        &self,
        job_leaf_outpoints: &[VirtualOutPoint],
    ) -> ArkResult<Option<VirtualOutPoint>> {
        let snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot;
        for outpoint in job_leaf_outpoints {
            let txid = outpoint.txid.to_string();
            if self.leaf_is_marked_unrolled(&txid, outpoint.vout)? {
                continue;
            }
            if let Some(snapshot) = snapshot.as_ref() {
                if let Some(record) = snapshot
                    .virtual_tx_outpoints
                    .iter()
                    .find(|record| record.txid == txid && record.vout == outpoint.vout)
                    && record.is_swept
                    && !record.is_unrolled
                {
                    return Ok(Some(outpoint.clone()));
                }
            }
        }

        let (vtxo_list, _) = self.client.list_vtxos().await?;
        for outpoint in job_leaf_outpoints {
            let txid = outpoint.txid.to_string();
            if self.leaf_is_marked_unrolled(&txid, outpoint.vout)? {
                continue;
            }
            if let Some(virtual_tx_outpoint) = vtxo_list.all().find(|row| {
                row.outpoint.txid == outpoint.txid && row.outpoint.vout == outpoint.vout
            }) && classify_operator_vtxo_outcome(virtual_tx_outpoint)
                == ExitingVtxoReconcileOutcome::KeepWarnAspMismatch
            {
                return Ok(Some(outpoint.clone()));
            }
        }

        Ok(None)
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
            super::exit_materials_prefetch::ensure_unilateral_exit_materials_for_leaf_tx(
                self, leaf_txid,
            )
            .await?;
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

        let ordered_step_txids = merge_exit_branch_txids(&branch_lists);
        Ok(UnilateralBatchPlan {
            leaves,
            ordered_step_txids,
            tx_by_id,
        })
    }

    async fn load_vtxo_chains_for_leaf_tx(&self, leaf_txid: Txid) -> ArkResult<VtxoChains> {
        if self.autonomous_mode() {
            let snapshot = self
                .wallet_db
                .snapshot()
                .offchain_vtxo_snapshot
                .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?;
            let txid = leaf_txid.to_string();
            let materials = snapshot_materials_for_leaf_tx(&snapshot, &txid)
                .ok_or(ArkWasmError::AutonomousExitMaterialsMissing)?;
            return vtxo_chains_from_json(&materials.chain_json);
        }

        let outpoint = representative_virtual_tx_outpoint_for_leaf_tx(
            self.wallet_db
                .snapshot()
                .offchain_vtxo_snapshot
                .as_ref()
                .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?,
            &leaf_txid.to_string(),
        )?
        .outpoint;
        let response = self
            .client
            .get_vtxo_chain(outpoint)
            .await
            .map_err(ArkWasmError::Client)?;
        Ok(response
            .map(|chain| chain.chains)
            .unwrap_or(VtxoChains { inner: Vec::new() }))
    }

    async fn first_incomplete_step_index(
        &self,
        blockchain: &EsploraBlockchain,
        ordered_step_txids: &[Txid],
    ) -> ArkResult<usize> {
        for (index, txid) in ordered_step_txids.iter().enumerate() {
            let confirmations = tx_confirmations(blockchain, txid).await?;
            if !step_reached_confirmation(confirmations) {
                return Ok(index);
            }
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
        let mut statuses = Vec::new();
        for (index, txid) in plan.ordered_step_txids.iter().enumerate() {
            let confirmations = tx_confirmations(blockchain, txid).await?;
            statuses.push(UnilateralExitNodeStatusDto {
                txid: txid.to_string(),
                confirmations,
                status: node_status_label(confirmations, index == current_step_index),
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
        let confirmations = tx_confirmations(blockchain, &step_txid).await?;
        if step_reached_confirmation(confirmations) {
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
        let raw_relayed = blockchain.is_tx_relayed_on_network(&step_txid).await?;
        Ok(unilateral_exit_step_broadcast_satisfied(
            raw_relayed,
            &step_txid,
            self.wallet_db.unilateral_exit_step_wait().as_ref(),
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
    fn merge_exit_branch_txids_dedupes_shared_prefix() {
        let shared = vec![txid(1), txid(2)];
        let leaf_a = [shared.clone(), vec![txid(3), txid(4)]].concat();
        let leaf_b = [shared, vec![txid(5), txid(6)]].concat();
        let merged = merge_exit_branch_txids(&[leaf_a, leaf_b]);
        assert_eq!(merged.len(), 6);
        assert_eq!(
            merged,
            vec![txid(1), txid(2), txid(3), txid(4), txid(5), txid(6)]
        );
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
}
