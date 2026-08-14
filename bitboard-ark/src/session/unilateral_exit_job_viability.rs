use std::collections::HashSet;

use ark_client::Blockchain;
use bitcoin::Txid;

use crate::api_types::{UnilateralExitJobViabilityDto, UnilateralExitJobViabilityKind};
use crate::error::ArkResult;
use crate::outpoint::VirtualOutPoint;
use crate::persistence::VirtualTxOutPointRecord;
use crate::session::exit_watch_reconcile::{ExitingVtxoReconcileOutcome, classify_operator_vtxo};
use crate::session::unilateral_exit_orchestrator::UnilateralBatchPlan;

pub(crate) fn wallet_unroll_step_txids(plan: &UnilateralBatchPlan) -> HashSet<Txid> {
    plan.ordered_step_txids.iter().copied().collect()
}

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
    let monitored_outpoints = exit_relevant_vtxo_outpoints_for_plan(plan, host_records);
    let allowed_spend_txids = wallet_unroll_step_txids(plan);
    let foreign_outpoint = detect_foreign_vtxo_outpoint_spends(
        blockchain,
        &monitored_outpoints,
        &allowed_spend_txids,
        |outpoint| leaf_is_marked_unrolled(outpoint),
    )
    .await?;
    if let Some(outpoint) = foreign_outpoint {
        return Ok(Some(viability_from_branch_funding_lost(
            format!(
                "Exit-relevant VTXO outpoint {}:{} was spent by a transaction outside the wallet unroll chain.",
                outpoint.txid, outpoint.vout
            ),
            vec![outpoint],
        )));
    }

    Ok(None)
}

pub(crate) fn detect_asp_swept_from_sources(
    job_leaf_outpoints: &[VirtualOutPoint],
    snapshot: Option<&crate::persistence::OffchainVtxoSnapshot>,
    operator_vtxos: &[ark_core::server::VirtualTxOutPoint],
    leaf_is_marked_unrolled: impl Fn(&str, u32) -> bool,
) -> Option<VirtualOutPoint> {
    for outpoint in job_leaf_outpoints {
        let txid = outpoint.txid.to_string();
        if leaf_is_marked_unrolled(&txid, outpoint.vout) {
            continue;
        }
        if let Some(snapshot) = snapshot {
            if let Some(record) = snapshot
                .virtual_tx_outpoints
                .iter()
                .find(|record| record.txid == txid && record.vout == outpoint.vout)
                && record.is_swept
                && !record.is_unrolled
            {
                return Some(outpoint.clone());
            }
        }
    }

    for outpoint in job_leaf_outpoints {
        let txid = outpoint.txid.to_string();
        if leaf_is_marked_unrolled(&txid, outpoint.vout) {
            continue;
        }
        if let Some(virtual_tx_outpoint) = operator_vtxos
            .iter()
            .find(|row| row.outpoint.txid == outpoint.txid && row.outpoint.vout == outpoint.vout)
            && classify_operator_vtxo_outcome(virtual_tx_outpoint)
                == ExitingVtxoReconcileOutcome::KeepWarnAspMismatch
        {
            return Some(outpoint.clone());
        }
    }

    None
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

pub(crate) fn viability_ok() -> UnilateralExitJobViabilityDto {
    UnilateralExitJobViabilityDto {
        status: UnilateralExitJobViabilityKind::Ok,
        reason_code: "ok".to_string(),
        detail_message: None,
        offending_outpoints: vec![],
    }
}

pub(crate) fn classify_operator_vtxo_outcome(
    virtual_tx_outpoint: &ark_core::server::VirtualTxOutPoint,
) -> ExitingVtxoReconcileOutcome {
    classify_operator_vtxo(virtual_tx_outpoint)
}

use std::str::FromStr;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::VirtualTxOutPointRecord;
    use ark_core::server::{ChainedTxType, VtxoChain, VtxoChains};
    use bitcoin::hashes::Hash;

    fn txid(byte: u8) -> Txid {
        Txid::from_byte_array([byte; 32])
    }

    use std::collections::HashMap;

    fn chain(txid: Txid, tx_type: ChainedTxType, spends: Vec<Txid>) -> VtxoChain {
        VtxoChain {
            txid,
            tx_type,
            spends,
            expires_at: 0,
        }
    }

    fn sample_plan() -> UnilateralBatchPlan {
        let leaf_txid = txid(10);
        let sibling = VirtualOutPoint::new(leaf_txid, 0);
        let step_txid = txid(20);
        UnilateralBatchPlan {
            leaves: vec![
                crate::session::unilateral_exit_orchestrator::LeafUnilateralContext {
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
    fn classify_operator_vtxo_swept_maps_to_asp_mismatch() {
        use ark_core::server::VirtualTxOutPoint;
        use bitcoin::OutPoint;

        let virtual_tx_outpoint = VirtualTxOutPoint {
            outpoint: OutPoint {
                txid: txid(1),
                vout: 0,
            },
            created_at: 0,
            expires_at: 0,
            amount: bitcoin::Amount::from_sat(1000),
            script: bitcoin::ScriptBuf::new(),
            is_preconfirmed: false,
            is_swept: true,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        };
        assert_eq!(
            classify_operator_vtxo_outcome(&virtual_tx_outpoint),
            ExitingVtxoReconcileOutcome::KeepWarnAspMismatch
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
#[path = "unilateral_exit_job_viability_integration_tests.rs"]
mod integration_tests;
