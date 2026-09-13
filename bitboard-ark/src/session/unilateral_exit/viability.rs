use std::collections::HashSet;
use std::str::FromStr;

use ark_client::Blockchain;
use bitcoin::Txid;

use crate::api_types::{
    UnilateralExitJobViabilityDto, UnilateralExitJobViabilityKind, UnilateralExitProgressParams,
};
use crate::error::{ArkResult, ArkWasmError};
use crate::outpoint::VirtualOutPoint;
use crate::persistence::VirtualTxOutPointRecord;
use crate::session::ArkSession;
use crate::session::unilateral_exit::plan::UnilateralBatchPlan;

use super::plan::branch_txids_for_leaf;
use super::snapshot_ops::dedup_virtual_outpoints;
use super::topology::merge_topology_nodes_from_chains;
use super::vtxo_exit::{
    parse_vtxo_exit_record_key, pre_unroll_record_keys_on_same_branch,
    stamp_pre_unroll_records_funding_lost, stamp_pre_unroll_records_funding_lost_for_asp_swept,
};
use crate::persistence::vtxo_exit_record_key;
use crate::unilateral_exit_materials::{
    require_unilateral_exit_materials_for_host_tx, virtual_psbts_from_records,
    vtxo_chains_from_json,
};

pub(crate) fn wallet_unroll_step_txids(plan: &UnilateralBatchPlan) -> HashSet<Txid> {
    plan.ordered_step_txids.iter().copied().collect()
}

/// Prevouts of `ordered_step_txids[0]` — the on-chain commitment (or other parent) that funds
/// the first unroll step. Empty when the plan has no first step or `tx_by_id` lacks that tx.
pub(crate) fn first_unroll_step_funding_prevouts(
    plan: &UnilateralBatchPlan,
) -> Vec<VirtualOutPoint> {
    let Some(first_step) = plan.ordered_step_txids.first() else {
        return Vec::new();
    };
    let Some(tx) = plan.tx_by_id.get(first_step) else {
        return Vec::new();
    };
    funding_prevouts_from_transaction(tx)
}

/// Same prevouts as [`first_unroll_step_funding_prevouts`], derived from snapshot materials
/// (chain order + virtual PSBT unsigned inputs) so Esplora reconcile can run without a job plan.
pub(crate) fn first_unroll_step_funding_prevouts_from_snapshot(
    snapshot: &crate::persistence::OffchainVtxoSnapshot,
    seed_host_txid: &str,
) -> ArkResult<Vec<VirtualOutPoint>> {
    let materials = require_unilateral_exit_materials_for_host_tx(snapshot, seed_host_txid)?;
    let chains = vtxo_chains_from_json(&materials.chain_json)?;
    let seed_txid =
        Txid::from_str(seed_host_txid).map_err(|_| ArkWasmError::AutonomousExitMaterialsMissing)?;
    let branch = branch_txids_for_leaf(&chains, seed_txid)
        .map_err(|_| ArkWasmError::AutonomousExitMaterialsMissing)?;
    let Some(first_step) = branch.first() else {
        return Err(ArkWasmError::AutonomousExitMaterialsMissing);
    };
    let psbts = virtual_psbts_from_records(&materials.virtual_psbts)?;
    let Some(psbt) = psbts
        .iter()
        .find(|psbt| psbt.unsigned_tx.compute_txid() == *first_step)
    else {
        return Err(ArkWasmError::AutonomousExitMaterialsMissing);
    };
    Ok(funding_prevouts_from_transaction(&psbt.unsigned_tx))
}

fn funding_prevouts_from_transaction(tx: &bitcoin::Transaction) -> Vec<VirtualOutPoint> {
    tx.input
        .iter()
        .filter(|input| !input.previous_output.is_null())
        .map(|input| VirtualOutPoint::new(input.previous_output.txid, input.previous_output.vout))
        .collect()
}

fn plan_sibling_outpoints(plan: &UnilateralBatchPlan) -> Vec<VirtualOutPoint> {
    plan.leaves
        .iter()
        .flat_map(|leaf| leaf.sibling_outpoints.iter().cloned())
        .collect()
}

/// VTXO outpoints to pass to the funding-lost stamper.
///
/// This does not stamp. A commitment prevout is not a VTXO exit record, so when that is
/// the Esplora hit, use the plan's job-leaf siblings instead.
fn vtxo_outpoints_to_mark_funding_lost(
    plan: &UnilateralBatchPlan,
    offending_outpoints: &[VirtualOutPoint],
) -> Vec<VirtualOutPoint> {
    let first_prevouts: HashSet<(Txid, u32)> = first_unroll_step_funding_prevouts(plan)
        .into_iter()
        .map(|outpoint| (outpoint.txid, outpoint.vout))
        .collect();
    if offending_outpoints
        .iter()
        .any(|outpoint| first_prevouts.contains(&(outpoint.txid, outpoint.vout)))
    {
        plan_sibling_outpoints(plan)
    } else {
        offending_outpoints.to_vec()
    }
}

/// Outpoints whose on-chain spend can steal unroll funding.
///
/// Plan siblings are the selected job leaves. Host records add other exit-eligible
/// VTXOs on `tree`/`ark` topology txs — including upstream hosts that are not in the
/// job selection. The same outpoint can appear in both; `(txid, vout)` is deduped.
pub(crate) fn exit_relevant_vtxo_outpoints_for_plan(
    plan: &UnilateralBatchPlan,
    host_records: &[VirtualTxOutPointRecord],
) -> Vec<VirtualOutPoint> {
    let mut seen = HashSet::new();
    let mut outpoints = Vec::new();

    for leaf in &plan.leaves {
        for sibling in &leaf.sibling_outpoints {
            let key = (sibling.txid, sibling.vout);
            if seen.insert(key) {
                outpoints.push(sibling.clone());
            }
        }
    }

    for record in host_records {
        let txid = match Txid::from_str(&record.txid) {
            Ok(txid) => txid,
            Err(_) => continue,
        };
        let key = (txid, record.vout);
        if seen.insert(key) {
            outpoints.push(VirtualOutPoint::new(txid, record.vout));
        }
    }

    outpoints
}

pub(crate) async fn evaluate_branch_funding_interference<B: Blockchain>(
    blockchain: &B,
    plan: &UnilateralBatchPlan,
    host_records: &[VirtualTxOutPointRecord],
    leaf_is_marked_unrolled: impl Fn(&VirtualOutPoint) -> bool,
) -> ArkResult<Option<UnilateralExitJobViabilityDto>> {
    let allowed_spend_txids = wallet_unroll_step_txids(plan);
    let first_step_prevouts = first_unroll_step_funding_prevouts(plan);
    if let Some(outpoint) = detect_foreign_vtxo_outpoint_spends(
        blockchain,
        &first_step_prevouts,
        &allowed_spend_txids,
        |_| false,
    )
    .await?
    {
        return Ok(Some(viability_from_foreign_unroll_spend(outpoint)));
    }

    let monitored_outpoints = exit_relevant_vtxo_outpoints_for_plan(plan, host_records);
    let foreign_outpoint = detect_foreign_vtxo_outpoint_spends(
        blockchain,
        &monitored_outpoints,
        &allowed_spend_txids,
        |outpoint| leaf_is_marked_unrolled(outpoint),
    )
    .await?;
    if let Some(outpoint) = foreign_outpoint {
        return Ok(Some(viability_from_foreign_unroll_spend(outpoint)));
    }

    Ok(None)
}

pub(crate) fn detect_asp_swept_from_snapshot(
    job_leaf_outpoints: &[VirtualOutPoint],
    snapshot: Option<&crate::persistence::OffchainVtxoSnapshot>,
    virtual_tx_is_marked_unrolled: impl Fn(&str) -> bool,
) -> Option<VirtualOutPoint> {
    for outpoint in job_leaf_outpoints {
        let txid = outpoint.txid.to_string();
        if virtual_tx_is_marked_unrolled(&txid) {
            continue;
        }
        if let Some(snapshot) = snapshot
            && let Some(record) = snapshot
                .virtual_tx_outpoints
                .iter()
                .find(|record| record.txid == txid && record.vout == outpoint.vout)
            && record.is_swept
            && !record.is_unrolled
        {
            return Some(outpoint.clone());
        }
    }

    None
}

pub(crate) fn asp_swept_viability_outpoint(
    autonomous_mode: bool,
    job_leaf_outpoints: &[VirtualOutPoint],
    snapshot: Option<&crate::persistence::OffchainVtxoSnapshot>,
    virtual_tx_is_marked_unrolled: impl Fn(&str) -> bool,
) -> Option<VirtualOutPoint> {
    if autonomous_mode {
        return None;
    }
    detect_asp_swept_from_snapshot(job_leaf_outpoints, snapshot, virtual_tx_is_marked_unrolled)
}

pub(crate) async fn detect_foreign_vtxo_outpoint_spends<B: Blockchain>(
    blockchain: &B,
    monitored_outpoints: &[VirtualOutPoint],
    allowed_spend_txids: &HashSet<Txid>,
    skip_outpoint: impl Fn(&VirtualOutPoint) -> bool,
) -> ArkResult<Option<VirtualOutPoint>> {
    for outpoint in monitored_outpoints {
        if skip_outpoint(outpoint) {
            continue;
        }
        if let Some(spend_txid) =
            spend_txid_on_chain_if_probeable(blockchain, &outpoint.txid, outpoint.vout).await?
            && !allowed_spend_txids.contains(&spend_txid)
        {
            return Ok(Some(outpoint.clone()));
        }
    }
    Ok(None)
}

async fn spend_txid_on_chain_if_probeable<B: Blockchain>(
    blockchain: &B,
    txid: &Txid,
    vout: u32,
) -> ArkResult<Option<Txid>> {
    match blockchain.get_output_status(txid, vout).await {
        Ok(status) => Ok(status.spend_txid),
        Err(error) if output_status_probe_unavailable(&error) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn output_status_probe_unavailable(error: &ark_client::Error) -> bool {
    let message = error.to_string();
    message.contains("Failed to get transaction outspends")
        || (message.contains("status: 500") && message.contains("outspend"))
        || message.contains("status: 404")
        || message.contains("Transaction not found")
}

pub(crate) fn viability_from_asp_swept(
    outpoint: &VirtualOutPoint,
) -> UnilateralExitJobViabilityDto {
    UnilateralExitJobViabilityDto {
        status: UnilateralExitJobViabilityKind::AspSweptTargets,
        reason_code: "asp_swept_targets".to_string(),
        detail_message: Some("Operator reports target VTXO as swept without unrolled.".to_string()),
        offending_outpoints: vec![outpoint.clone()],
    }
}

pub(crate) fn viability_from_branch_funding_lost(
    detail_message: String,
    offending_outpoints: Vec<VirtualOutPoint>,
) -> UnilateralExitJobViabilityDto {
    UnilateralExitJobViabilityDto {
        status: UnilateralExitJobViabilityKind::BranchFundingLost,
        reason_code: "branch_funding_lost".to_string(),
        detail_message: Some(detail_message),
        offending_outpoints,
    }
}

fn viability_from_foreign_unroll_spend(outpoint: VirtualOutPoint) -> UnilateralExitJobViabilityDto {
    viability_from_branch_funding_lost(
        format!(
            "Exit-relevant VTXO outpoint {}:{} was spent by a transaction outside the wallet unroll chain.",
            outpoint.txid, outpoint.vout
        ),
        vec![outpoint],
    )
}

pub(crate) fn viability_ok() -> UnilateralExitJobViabilityDto {
    UnilateralExitJobViabilityDto {
        status: UnilateralExitJobViabilityKind::Ok,
        reason_code: "ok".to_string(),
        detail_message: None,
        offending_outpoints: vec![],
    }
}

fn wallet_unroll_step_txids_from_snapshot_materials(
    snapshot: &crate::persistence::OffchainVtxoSnapshot,
) -> HashSet<Txid> {
    let mut txids = HashSet::new();
    for materials in snapshot.unilateral_exit_materials_by_host_tx.values() {
        let Ok(chains) =
            crate::unilateral_exit_materials::vtxo_chains_from_json(&materials.chain_json)
        else {
            continue;
        };
        for link in &chains.inner {
            txids.insert(link.txid);
        }
    }
    txids
}

fn wallet_unroll_step_txids_from_host(
    snapshot: &crate::persistence::OffchainVtxoSnapshot,
    host_txid: &str,
) -> ArkResult<HashSet<Txid>> {
    Ok(
        super::vtxo_exit::host_txids_on_same_materials_branch(snapshot, host_txid)?
            .into_iter()
            .filter_map(|txid| Txid::from_str(&txid).ok())
            .collect(),
    )
}

impl ArkSession {
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

        if let Some(outpoint) = asp_swept_viability_outpoint(
            self.autonomous_mode(),
            &job_leaf_outpoints,
            self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref(),
            |txid| self.virtual_tx_is_marked_unrolled(txid).unwrap_or(false),
        ) {
            self.stamp_funding_lost_for_seized_outpoints(std::slice::from_ref(&outpoint))?;
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
                self.virtual_tx_is_marked_unrolled(&outpoint.txid.to_string())
                    .unwrap_or(false)
            })
            .await?
        {
            let vtxo_outpoints =
                vtxo_outpoints_to_mark_funding_lost(&plan, &viability.offending_outpoints);
            self.stamp_funding_lost_for_seized_outpoints(&vtxo_outpoints)?;
            return Ok(viability);
        }

        Ok(viability_ok())
    }

    fn stamp_funding_lost_for_seized_outpoints(
        &self,
        offending_outpoints: &[VirtualOutPoint],
    ) -> ArkResult<()> {
        let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot else {
            return Ok(());
        };
        let mut records = self.wallet_db.vtxo_exit_records();
        let mut keys = HashSet::new();
        for outpoint in offending_outpoints {
            keys.extend(pre_unroll_record_keys_on_same_branch(
                &snapshot,
                &records,
                &outpoint.txid.to_string(),
                outpoint.vout,
            )?);
        }
        stamp_pre_unroll_records_funding_lost(&mut records, &keys);
        self.wallet_db.set_vtxo_exit_records(records);
        Ok(())
    }

    /// Record-scoped viability on Esplora reconcile call sites (`ARK-EXIT-33`). Stamps `funding_lost` on
    /// unpublished VTXOs of a seized branch, including aborted leftovers with no frontend job.
    pub(crate) async fn reconcile_vtxo_exit_viability(&self) -> ArkResult<Vec<String>> {
        let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot else {
            return Ok(Vec::new());
        };
        let mut records = self.wallet_db.vtxo_exit_records();
        let pre_unroll: Vec<(String, u32)> = records
            .iter()
            .filter(|(_, record)| record.phase.is_pre_unroll())
            .filter_map(|(key, _)| parse_vtxo_exit_record_key(key))
            .collect();
        if pre_unroll.is_empty() {
            return Ok(Vec::new());
        }

        let mut stamped = stamp_pre_unroll_records_funding_lost_for_asp_swept(
            &snapshot,
            &mut records,
            self.autonomous_mode(),
            |host| self.virtual_tx_is_marked_unrolled(host).unwrap_or(false),
        )?;

        let blockchain = self.client.blockchain();
        let mut allowed = wallet_unroll_step_txids_from_snapshot_materials(&snapshot);
        let mut probed_first_step_prevouts = HashSet::new();
        let mut seized_first_step_prevouts = HashSet::new();
        for (txid, vout) in &pre_unroll {
            let record_key = vtxo_exit_record_key(txid, *vout);
            if records
                .get(&record_key)
                .is_some_and(|record| !record.phase.is_pre_unroll())
            {
                continue;
            }
            let outpoint = match VirtualOutPoint::parse(txid, *vout) {
                Ok(outpoint) => outpoint,
                Err(_) => continue,
            };
            let host_txid = records
                .get(&record_key)
                .map(|record| record.host_txid.clone())
                .unwrap_or_else(|| txid.clone());
            allowed.extend(wallet_unroll_step_txids_from_host(&snapshot, &host_txid)?);
            let first_step_prevouts =
                first_unroll_step_funding_prevouts_from_snapshot(&snapshot, &host_txid)?;
            for prevout in &first_step_prevouts {
                let key = (prevout.txid, prevout.vout);
                if !probed_first_step_prevouts.insert(key) {
                    continue;
                }
                if detect_foreign_vtxo_outpoint_spends(
                    blockchain,
                    std::slice::from_ref(prevout),
                    &allowed,
                    |_| false,
                )
                .await?
                .is_some()
                {
                    seized_first_step_prevouts.insert(key);
                }
            }
            let first_step_seized = first_step_prevouts
                .iter()
                .any(|prevout| seized_first_step_prevouts.contains(&(prevout.txid, prevout.vout)));
            if first_step_seized
                || detect_foreign_vtxo_outpoint_spends(
                    blockchain,
                    std::slice::from_ref(&outpoint),
                    &allowed,
                    |monitored| {
                        self.virtual_tx_is_marked_unrolled(&monitored.txid.to_string())
                            .unwrap_or(false)
                    },
                )
                .await?
                .is_some()
            {
                let keys = pre_unroll_record_keys_on_same_branch(&snapshot, &records, txid, *vout)?;
                stamp_pre_unroll_records_funding_lost(&mut records, &keys);
                stamped = true;
            }
        }

        self.wallet_db.set_vtxo_exit_records(records);
        if stamped {
            Ok(vec![
                "One or more VTXOs in a unilateral-exit branch lost funding (operator sweep or on-chain seizure). Already-unrolled coins remain claimable via Complete."
                    .to_string(),
            ])
        } else {
            Ok(Vec::new())
        }
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
            if !self.virtual_tx_is_marked_unrolled(&outpoint.txid.to_string())? {
                return Ok(false);
            }
        }
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::VirtualTxOutPointRecord;
    use ark_core::server::VtxoChains;
    use bitcoin::hashes::Hash;

    fn txid(byte: u8) -> Txid {
        Txid::from_byte_array([byte; 32])
    }

    use std::collections::HashMap;

    fn sample_plan() -> UnilateralBatchPlan {
        let leaf_txid = txid(10);
        let sibling = VirtualOutPoint::new(leaf_txid, 0);
        let step_txid = txid(20);
        UnilateralBatchPlan {
            leaves: vec![
                crate::session::unilateral_exit::plan::LeafUnilateralContext {
                    leaf_txid,
                    sibling_outpoints: vec![sibling],
                    chains: VtxoChains { inner: vec![] },
                    branch_txids: vec![],
                    commitment_txids: vec![],
                    amount_sats: 100_000,
                },
            ],
            ordered_step_txids: vec![step_txid],
            tx_by_id: HashMap::new(),
        }
    }

    #[test]
    fn exit_relevant_vtxo_outpoints_dedupes_leaf_and_host_records() {
        let plan = sample_plan();
        let host_txid = txid(3);
        let records = vec![VirtualTxOutPointRecord {
            txid: host_txid.to_string(),
            vout: 1,
            created_at: 0,
            expires_at: 0,
            amount_sats: 50_000,
            script_hex: "00".to_string(),
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
        }];
        let outpoints = exit_relevant_vtxo_outpoints_for_plan(&plan, &records);
        assert_eq!(outpoints.len(), 2);
        assert!(
            outpoints
                .iter()
                .any(|outpoint| outpoint.txid == txid(10) && outpoint.vout == 0)
        );
        assert!(
            outpoints
                .iter()
                .any(|outpoint| outpoint.txid == host_txid && outpoint.vout == 1)
        );
    }

    #[test]
    fn wallet_unroll_step_txids_matches_ordered_steps() {
        let plan = sample_plan();
        let allowed = wallet_unroll_step_txids(&plan);
        assert_eq!(allowed.len(), 1);
        assert!(allowed.contains(&txid(20)));
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
#[path = "viability_integration_tests.rs"]
mod integration_tests;
