use std::collections::HashSet;
use std::str::FromStr;

use bitcoin::{Amount, OutPoint, Txid};

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
