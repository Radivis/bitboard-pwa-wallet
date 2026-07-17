use std::collections::{HashMap, HashSet};

use ark_client::MissingBlocktimeCompletionInput;
use ark_core::{Vtxo, VtxoList};
use bitcoin::{Address, Amount, OutPoint, ScriptBuf};

use crate::api_types::{ExitCandidateRow, VtxoOutpointDto};
use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::{UnilateralExitOutpointKey, is_unilateral_exit_in_progress_outpoint};
use crate::offchain_snapshot::virtual_tx_outpoint_from_record;
use crate::persistence::OffchainVtxoSnapshot;
use crate::session::mappers::{map_exit_candidate, parse_outpoint};
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
    vtxo_outpoints: &[VtxoOutpointDto],
    destination: Address,
    fee_rate_sat_per_vb: f64,
) -> ArkResult<String> {
    autonomous_validate_completion_ready(session, vtxo_outpoints)?;
    let parsed_outpoints = parse_vtxo_outpoints(vtxo_outpoints)?;
    let (vtxo_list, script_map) = autonomous_vtxo_list_and_script_map(session)?;
    let txid = session
        .client
        .send_on_chain_for_vtxo_outpoints_with_vtxo_list(
            destination,
            &parsed_outpoints,
            &vtxo_list,
            &script_map,
            Some(fee_rate_sat_per_vb),
        )
        .await?;
    session.clear_pending_unilateral_exits_for_outpoints(&parsed_outpoints);
    Ok(txid.to_string())
}

pub(crate) async fn autonomous_estimate_unilateral_exit_completion(
    session: &ArkSession,
    vtxo_outpoints: &[VtxoOutpointDto],
    destination: Address,
    fee_rate_sat_per_vb: f64,
) -> ArkResult<(Amount, Amount, Amount, Vec<MissingBlocktimeCompletionInput>)> {
    autonomous_validate_completion_ready(session, vtxo_outpoints)?;
    let parsed_outpoints = parse_vtxo_outpoints(vtxo_outpoints)?;
    let (vtxo_list, script_map) = autonomous_vtxo_list_and_script_map(session)?;
    session
        .client
        .estimate_send_on_chain_for_vtxo_outpoints_with_vtxo_list(
            destination,
            &parsed_outpoints,
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

pub(crate) fn dedup_vtxo_outpoint_dtos(dtos: Vec<VtxoOutpointDto>) -> Vec<VtxoOutpointDto> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for dto in dtos {
        if seen.insert((dto.txid.clone(), dto.vout)) {
            deduped.push(dto);
        }
    }
    deduped
}

pub(crate) fn parse_vtxo_outpoints(dtos: &[VtxoOutpointDto]) -> ArkResult<Vec<OutPoint>> {
    let mut seen = HashSet::new();
    let mut outpoints = Vec::new();
    for dto in dtos {
        let outpoint = parse_outpoint(&dto.txid, dto.vout)?;
        if seen.insert(outpoint) {
            outpoints.push(outpoint);
        }
    }
    Ok(outpoints)
}

pub(crate) fn validate_snapshot_completion_ready(
    snapshot: &OffchainVtxoSnapshot,
    vtxo_outpoints: &[VtxoOutpointDto],
) -> ArkResult<()> {
    for dto in vtxo_outpoints {
        let Some(record) = snapshot
            .virtual_tx_outpoints
            .iter()
            .find(|record| record.txid == dto.txid && record.vout == dto.vout)
        else {
            return Err(ArkWasmError::VtxoUnilateralExitNotReady {
                txid: dto.txid.clone(),
                vout: dto.vout,
            });
        };
        if !record.is_unrolled || record.is_spent {
            return Err(ArkWasmError::VtxoUnilateralExitNotReady {
                txid: dto.txid.clone(),
                vout: dto.vout,
            });
        }
    }
    Ok(())
}

pub(crate) fn autonomous_validate_completion_ready(
    session: &ArkSession,
    vtxo_outpoints: &[VtxoOutpointDto],
) -> ArkResult<()> {
    let snapshot = session
        .wallet_db
        .snapshot()
        .offchain_vtxo_snapshot
        .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?;
    validate_snapshot_completion_ready(&snapshot, vtxo_outpoints)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::VirtualTxOutPointRecord;
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;

    fn snapshot_record(
        txid_byte: u8,
        vout: u32,
        is_unrolled: bool,
        is_spent: bool,
    ) -> VirtualTxOutPointRecord {
        VirtualTxOutPointRecord {
            txid: Txid::from_byte_array([txid_byte; 32]).to_string(),
            vout,
            created_at: 0,
            expires_at: 9_999_999_999,
            amount_sats: 50_000,
            script_hex: String::new(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled,
            is_spent,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
            server_pk_hex: None,
            unilateral_exit_materials: None,
        }
    }

    fn sample_snapshot(records: Vec<VirtualTxOutPointRecord>) -> OffchainVtxoSnapshot {
        OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: records,
        }
    }

    #[test]
    fn parse_vtxo_outpoints_dedupes_by_outpoint() {
        let txid = Txid::from_byte_array([0x44; 32]).to_string();
        let dtos = vec![
            VtxoOutpointDto {
                txid: txid.clone(),
                vout: 0,
            },
            VtxoOutpointDto {
                txid: txid.clone(),
                vout: 0,
            },
            VtxoOutpointDto {
                txid: txid.clone(),
                vout: 1,
            },
        ];
        let parsed = parse_vtxo_outpoints(&dtos).expect("parse outpoints");
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].vout, 0);
        assert_eq!(parsed[1].vout, 1);
    }

    #[test]
    fn validate_snapshot_completion_ready_accepts_ready_outpoint() {
        let txid = Txid::from_byte_array([0x55; 32]).to_string();
        let snapshot = sample_snapshot(vec![snapshot_record(0x55, 0, true, false)]);
        let outpoints = vec![VtxoOutpointDto {
            txid: txid.clone(),
            vout: 0,
        }];
        validate_snapshot_completion_ready(&snapshot, &outpoints).expect("ready outpoint");
    }

    #[test]
    fn validate_snapshot_completion_ready_rejects_unready_sibling_vout() {
        let txid = Txid::from_byte_array([0x66; 32]).to_string();
        let snapshot = sample_snapshot(vec![
            snapshot_record(0x66, 0, true, false),
            snapshot_record(0x66, 1, false, false),
        ]);
        let ready = vec![VtxoOutpointDto {
            txid: txid.clone(),
            vout: 0,
        }];
        validate_snapshot_completion_ready(&snapshot, &ready).expect("vout 0 ready");

        let unready = vec![VtxoOutpointDto { txid, vout: 1 }];
        let error = validate_snapshot_completion_ready(&snapshot, &unready)
            .expect_err("vout 1 not unrolled");
        assert!(matches!(
            error,
            ArkWasmError::VtxoUnilateralExitNotReady { vout: 1, .. }
        ));
    }
}
