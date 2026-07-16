use std::collections::{HashMap, HashSet};
use std::str::FromStr;

use ark_client::MissingBlocktimeCompletionInput;
use ark_core::{Vtxo, VtxoList};
use bitcoin::{Address, Amount, OutPoint, ScriptBuf, Txid};

use crate::api_types::ExitCandidateRow;
use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::{UnilateralExitOutpointKey, is_unilateral_exit_in_progress_outpoint};
use crate::offchain_snapshot::virtual_tx_outpoint_from_record;
use crate::persistence::VirtualTxOutPointRecord;
use crate::session::mappers::map_exit_candidate;
use crate::unilateral_exit_materials::{
    record_is_exit_eligible, snapshot_record_materials, virtual_psbts_from_records,
    vtxo_chains_from_json,
};

use super::ArkSession;

pub(crate) struct AutonomousUnrollChainSteps {
    pub chain_tx_count: u32,
    pub projected_unroll_steps: u32,
    pub projected_wait_steps: u32,
}

/// Offline VTXO list for autonomous exit flows (no operator `list_vtxos`).
pub(crate) fn autonomous_vtxo_list(session: &ArkSession) -> ArkResult<VtxoList> {
    session
        .snapshot_vtxo_list_and_script_map()
        .map(|(vtxo_list, _)| vtxo_list)
}

/// Offline VTXO list and script map for autonomous completion coin-select.
pub(crate) fn autonomous_vtxo_list_and_script_map(
    session: &ArkSession,
) -> ArkResult<(VtxoList, HashMap<ScriptBuf, Vtxo>)> {
    session.snapshot_vtxo_list_and_script_map()
}

pub(crate) fn autonomous_unilateral_exit_chain_steps(
    session: &ArkSession,
    txid: &str,
    vout: u32,
) -> ArkResult<AutonomousUnrollChainSteps> {
    let snapshot = session.wallet_db.snapshot().offchain_vtxo_snapshot;
    let materials = snapshot
        .as_ref()
        .and_then(|snapshot| snapshot_record_materials(snapshot, txid, vout))
        .ok_or(ArkWasmError::AutonomousExitMaterialsMissing)?;
    let (projected_unroll_steps, projected_wait_steps) = autonomous_chain_step_counts(materials)?;
    Ok(AutonomousUnrollChainSteps {
        chain_tx_count: projected_unroll_steps.saturating_add(1),
        projected_unroll_steps,
        projected_wait_steps,
    })
}

pub(crate) async fn autonomous_complete_unilateral_exit(
    session: &ArkSession,
    deduped_vtxo_txids: &[String],
    destination: Address,
    fee_rate_sat_per_vb: f64,
) -> ArkResult<String> {
    autonomous_validate_completion_ready(session, deduped_vtxo_txids)?;
    let (vtxo_list, script_map) = autonomous_vtxo_list_and_script_map(session)?;
    let vtxo_txids = parse_vtxo_txids(deduped_vtxo_txids)?;
    let txid = session
        .client
        .send_on_chain_for_vtxo_txids_with_vtxo_list(
            destination,
            &vtxo_txids,
            &vtxo_list,
            &script_map,
            Some(fee_rate_sat_per_vb),
        )
        .await?;
    session.clear_pending_unilateral_exits_for_txids(&vtxo_txids);
    Ok(txid.to_string())
}

pub(crate) async fn autonomous_estimate_unilateral_exit_completion(
    session: &ArkSession,
    deduped_vtxo_txids: &[String],
    vtxo_txids: &[Txid],
    destination: Address,
    fee_rate_sat_per_vb: f64,
) -> ArkResult<(Amount, Amount, Amount, Vec<MissingBlocktimeCompletionInput>)> {
    autonomous_validate_completion_ready(session, deduped_vtxo_txids)?;
    let (vtxo_list, script_map) = autonomous_vtxo_list_and_script_map(session)?;
    session
        .client
        .estimate_send_on_chain_for_vtxo_txids_with_vtxo_list(
            destination,
            vtxo_txids,
            &vtxo_list,
            &script_map,
            Some(fee_rate_sat_per_vb),
        )
        .await
        .map_err(Into::into)
}

pub(crate) fn autonomous_exit_candidates_from_snapshot(
    session: &ArkSession,
    in_progress: &HashSet<UnilateralExitOutpointKey>,
) -> ArkResult<Vec<ExitCandidateRow>> {
    let snapshot = session
        .wallet_db
        .snapshot()
        .offchain_vtxo_snapshot
        .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?;
    let dust = Amount::from_sat(snapshot.dust_sats);
    let mut rows = Vec::new();
    for record in &snapshot.virtual_tx_outpoints {
        if !record_is_exit_eligible(record) || record.unilateral_exit_materials.is_none() {
            continue;
        }
        let virtual_tx_outpoint = virtual_tx_outpoint_from_record(record)?;
        let candidate = map_exit_candidate(&virtual_tx_outpoint, dust);
        if candidate.can_complete
            || is_unilateral_exit_in_progress_outpoint(in_progress, &candidate.txid, candidate.vout)
        {
            continue;
        }
        rows.push(candidate);
    }
    Ok(rows)
}

pub(crate) fn autonomous_chain_step_counts(
    materials: &crate::persistence::UnilateralExitMaterialsRecord,
) -> ArkResult<(u32, u32)> {
    let chains = vtxo_chains_from_json(&materials.chain_json)?;
    let chain_tx_count = chains.inner.len() as u32;
    let projected_unroll_steps = chain_tx_count.saturating_sub(1);
    let projected_wait_steps = chains
        .inner
        .iter()
        .map(|link| link.spends.len())
        .sum::<usize>() as u32;
    Ok((projected_unroll_steps, projected_wait_steps))
}

pub(crate) async fn autonomous_build_unilateral_branch(
    session: &ArkSession,
    target: OutPoint,
) -> ArkResult<Vec<bitcoin::Transaction>> {
    let snapshot = session
        .wallet_db
        .snapshot()
        .offchain_vtxo_snapshot
        .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?;
    let txid = target.txid.to_string();
    let vout = target.vout;
    let materials = snapshot_record_materials(&snapshot, &txid, vout)
        .ok_or(ArkWasmError::AutonomousExitMaterialsMissing)?;
    let record = snapshot
        .virtual_tx_outpoints
        .iter()
        .find(|record| record.txid == txid && record.vout == vout)
        .ok_or_else(|| ArkWasmError::VtxoNotFound { txid, vout })?;
    let virtual_tx_outpoint = virtual_tx_outpoint_from_record(record)?;
    let chains = vtxo_chains_from_json(&materials.chain_json)?;
    let virtual_psbts = virtual_psbts_from_records(&materials.virtual_psbts)?;
    session
        .client
        .build_unilateral_exit_branch_from_materials(
            target,
            &virtual_tx_outpoint,
            chains,
            virtual_psbts,
        )
        .await
        .map_err(Into::into)
}

pub(crate) fn autonomous_snapshot_can_complete(
    txid: &str,
    record: &VirtualTxOutPointRecord,
) -> bool {
    record.txid == txid && record.is_unrolled && !record.is_spent
}

pub(crate) fn autonomous_validate_completion_ready(
    session: &ArkSession,
    vtxo_txids: &[String],
) -> ArkResult<()> {
    let snapshot = session
        .wallet_db
        .snapshot()
        .offchain_vtxo_snapshot
        .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?;
    for vtxo_txid in vtxo_txids {
        let Some(record) = snapshot
            .virtual_tx_outpoints
            .iter()
            .find(|record| record.txid == *vtxo_txid)
        else {
            return Err(ArkWasmError::VtxoUnilateralExitNotReady {
                txid: vtxo_txid.clone(),
            });
        };
        if !autonomous_snapshot_can_complete(vtxo_txid, record) {
            return Err(ArkWasmError::VtxoUnilateralExitNotReady {
                txid: vtxo_txid.clone(),
            });
        }
    }
    Ok(())
}

pub(crate) fn parse_vtxo_txids(vtxo_txids: &[String]) -> ArkResult<Vec<Txid>> {
    vtxo_txids
        .iter()
        .map(|txid| {
            Txid::from_str(txid).map_err(|error| ArkWasmError::InvalidTxid(error.to_string()))
        })
        .collect()
}
