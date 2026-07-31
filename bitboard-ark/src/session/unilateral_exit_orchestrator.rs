use std::collections::{HashMap, HashSet};

use ark_core::build_unilateral_exit_tree_txids;
use ark_core::server::VtxoChains;
use bitcoin::{Transaction, Txid};

use crate::api_types::{
    ProceedUnilateralExitStepParams, ProceedUnilateralExitStepResultDto,
    UnilateralExitBatchEstimateDto, UnilateralExitBatchEstimateParams, UnilateralExitLeafStatusDto,
    UnilateralExitNodeStatusDto, UnilateralExitNodeStatusKind, UnilateralExitPhase,
    UnilateralExitProgressDto, UnilateralExitProgressParams, UnilateralExitTopologyDto,
    UnilateralExitTopologyParams,
};
use crate::constants::{
    MIN_FEE_RATE_SAT_PER_VB, UNILATERAL_EXIT_CHILD_VSIZE_VB, UNILATERAL_EXIT_LEAF_CONFIRMATIONS,
    UNILATERAL_EXIT_STEP_CONFIRMATION_POLL_INTERVAL_SECS, UNILATERAL_EXIT_STEP_CONFIRMATIONS,
};
use crate::error::{ArkResult, ArkWasmError};
use crate::esplora_blockchain::EsploraBlockchain;
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
use super::unilateral_exit_branch_topology::{
    merge_topology_nodes_from_chains, terminal_vtxo_host_txids_for_topology,
    topology_host_outpoints, topology_leaf_outpoints, virtual_tx_type_hosts_exit_outpoints,
};

const OPERATOR_INDEXER_POLL_MAX: u8 = 60;

fn step_confirmation_poll_delay() -> std::time::Duration {
    std::time::Duration::from_secs(UNILATERAL_EXIT_STEP_CONFIRMATION_POLL_INTERVAL_SECS)
}

struct LeafUnilateralContext {
    leaf_txid: Txid,
    sibling_outpoints: Vec<VirtualOutPoint>,
    chains: VtxoChains,
    branch_txids: Vec<Txid>,
    commitment_txids: Vec<Txid>,
    amount_sats: u64,
}

struct UnilateralBatchPlan {
    leaves: Vec<LeafUnilateralContext>,
    ordered_step_txids: Vec<Txid>,
    tx_by_id: HashMap<Txid, Transaction>,
}

#[cfg(target_arch = "wasm32")]
async fn sleep(duration: std::time::Duration) {
    bitboard_wasm_sleep::sleep_for(duration).await;
}

#[cfg(not(target_arch = "wasm32"))]
async fn sleep(duration: std::time::Duration) {
    tokio::time::sleep(duration).await;
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

        let plan_result = self.build_unilateral_batch_plan(&virtual_outpoints).await;
        let (projected_unroll_steps, estimate_error) = match plan_result {
            Ok(plan) => (plan.ordered_step_txids.len().max(1) as u32, None),
            Err(ArkWasmError::AutonomousExitMaterialsMissing) => (
                0,
                Some("Exit materials not prefetched for one or more VTXOs".to_string()),
            ),
            Err(error) => return Err(error),
        };

        let estimated_package_fee_sats = if estimate_error.is_none() {
            (projected_unroll_steps as f64
                * fee_rate_sat_per_vb
                * UNILATERAL_EXIT_CHILD_VSIZE_VB as f64)
                .ceil() as u64
        } else {
            0
        };

        Ok(UnilateralExitBatchEstimateDto {
            projected_unroll_steps,
            estimated_package_fee_sats,
            fee_rate_sat_per_vb,
            bumper_balance_sats,
            bumper_sufficient: bumper_balance_sats >= estimated_package_fee_sats,
            estimate_error,
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
            self.finalize_leaves_at_depth(&plan).await?;
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

        if !step_reached_confirmation(confirmations_before) {
            if !blockchain.is_tx_relayed_on_network(&step_txid).await? {
                self.client
                    .broadcast_unilateral_exit_step_at_fee_rate(&parent_tx, fee_rate_sat_per_vb)
                    .await
                    .map_err(ArkWasmError::Client)?;
            }

            self.wallet_db.ensure_unilateral_exit_step_wait(
                &step_txid.to_string(),
                current_step_index as u32,
            );
            self.wait_for_step_confirmation(blockchain, &step_txid)
                .await?;
        } else {
            self.wallet_db.clear_unilateral_exit_step_wait();
        }

        self.finalize_leaves_at_depth(&plan).await?;

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
        let current_step_index = self
            .first_incomplete_step_index(blockchain, &plan.ordered_step_txids)
            .await?;
        let phase = if current_step_index >= plan.ordered_step_txids.len() {
            UnilateralExitPhase::Complete
        } else {
            UnilateralExitPhase::Idle
        };

        let node_statuses = self
            .node_statuses_for_plan(blockchain, &plan, current_step_index)
            .await?;
        let leaf_statuses = self.leaf_statuses_for_plan(blockchain, &plan).await?;

        let current_step_waiting_since = self
            .current_step_waiting_since(blockchain, &plan, current_step_index)
            .await?;

        Ok(UnilateralExitProgressDto {
            step_index: current_step_index.min(plan.ordered_step_txids.len()) as u32,
            total_steps: plan.ordered_step_txids.len().max(1) as u32,
            phase,
            current_step_waiting_since,
            node_statuses,
            leaf_statuses,
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

    async fn wait_for_step_confirmation(
        &self,
        blockchain: &EsploraBlockchain,
        txid: &Txid,
    ) -> ArkResult<()> {
        loop {
            if step_reached_confirmation(tx_confirmations(blockchain, txid).await?) {
                self.wallet_db.clear_unilateral_exit_step_wait();
                return Ok(());
            }
            sleep(step_confirmation_poll_delay()).await;
        }
    }

    async fn finalize_leaves_at_depth(&self, plan: &UnilateralBatchPlan) -> ArkResult<()> {
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
            let confirmations = tx_confirmations(blockchain, &leaf_txid).await?;
            if !leaf_reached_finality(confirmations) {
                continue;
            }
            self.mark_leaf_virtual_tx_vtxos_unrolled_in_snapshot(&leaf_virtual_txid)?;
            enrich_unilateral_exit_watches_for_leaf_tx_after_unroll(
                &self.wallet_db,
                &leaf_virtual_txid,
                &leaf_txid.to_string(),
                &leaf.branch_txids,
            );
            if !self.autonomous_mode() {
                let representative_vout =
                    representative_vout_among_virtual_outpoints(&leaf.sibling_outpoints);
                let _ = self
                    .poll_operator_after_leaf_finality(&leaf_virtual_txid, representative_vout)
                    .await;
            }
        }
        Ok(())
    }

    async fn poll_operator_after_leaf_finality(&self, txid: &str, vout: u32) -> ArkResult<()> {
        for attempt in 0..OPERATOR_INDEXER_POLL_MAX {
            if attempt > 0 {
                sleep(step_confirmation_poll_delay()).await;
            }
            let vtxo_list = match self.sync_with_operator_and_vtxo_list().await {
                Ok((vtxo_list, _sync_result)) => vtxo_list,
                Err(_) => self.client.list_vtxos().await?.0,
            };
            if super::exit::operator_vtxo_is_unrolled(&vtxo_list, txid, vout) {
                return Ok(());
            }
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
        let resolved_phase = if current_step_index >= plan.ordered_step_txids.len() {
            UnilateralExitPhase::Complete
        } else {
            phase
        };
        let current_step_waiting_since = self
            .current_step_waiting_since(blockchain, plan, current_step_index)
            .await?;
        Ok(ProceedUnilateralExitStepResultDto {
            step_txid,
            step_index: step_index as u32,
            total_steps: plan.ordered_step_txids.len().max(1) as u32,
            phase: resolved_phase,
            current_step_waiting_since,
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
