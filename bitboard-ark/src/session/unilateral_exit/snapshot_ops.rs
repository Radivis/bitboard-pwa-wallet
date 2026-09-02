use std::collections::{HashMap, HashSet};

use ark_client::MissingBlocktimeCompletionInput;
use ark_core::{Vtxo, VtxoList};
use bitcoin::{Address, Amount, OutPoint, ScriptBuf};

use crate::api_types::ExitCandidateDto;
use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::{UnilateralExitOutpointKey, is_unilateral_exit_in_progress_outpoint};
use crate::offchain_snapshot::virtual_tx_outpoint_from_record;
use crate::outpoint::{VirtualOutPoint, representative_virtual_tx_outpoint_for_leaf_tx};
use crate::persistence::OffchainVtxoSnapshot;
use crate::session::mappers::map_exit_candidate;
use crate::unilateral_exit_materials::{
    materials_for_unroll_leaf_tx, record_is_exit_eligible, virtual_psbts_from_records,
    vtxo_chains_from_json,
};

use crate::session::ArkSession;

/// Offline VTXO list and script map for autonomous completion coin-select.
pub(crate) fn autonomous_vtxo_list_and_script_map(
    session: &ArkSession,
) -> ArkResult<(VtxoList, HashMap<ScriptBuf, Vtxo>)> {
    session.snapshot_vtxo_list_and_script_map()
}

pub(crate) async fn autonomous_complete_unilateral_exit(
    session: &ArkSession,
    vtxo_outpoints: &[VirtualOutPoint],
    destination: Address,
    fee_rate_sat_per_vb: f64,
) -> ArkResult<String> {
    autonomous_validate_completion_ready(session, vtxo_outpoints)?;
    let parsed_outpoints = virtual_outpoints_to_bitcoin(vtxo_outpoints)?;
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
    session.finalize_unilateral_exit_completion_local_state(&parsed_outpoints, &txid.to_string());
    Ok(txid.to_string())
}

pub(crate) async fn autonomous_estimate_unilateral_exit_completion(
    session: &ArkSession,
    vtxo_outpoints: &[VirtualOutPoint],
    destination: Address,
    fee_rate_sat_per_vb: f64,
) -> ArkResult<(Amount, Amount, Amount, Vec<MissingBlocktimeCompletionInput>)> {
    autonomous_validate_completion_ready(session, vtxo_outpoints)?;
    let parsed_outpoints = virtual_outpoints_to_bitcoin(vtxo_outpoints)?;
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

pub(crate) fn exit_candidates_from_snapshot(
    snapshot: &OffchainVtxoSnapshot,
    in_progress: &HashSet<UnilateralExitOutpointKey>,
) -> ArkResult<Vec<ExitCandidateDto>> {
    let dust = Amount::from_sat(snapshot.dust_sats);
    let mut rows = Vec::new();
    for record in &snapshot.virtual_tx_outpoints {
        if !record_is_exit_eligible(record)
            || !snapshot
                .unilateral_exit_materials_by_leaf_tx
                .contains_key(&record.txid)
        {
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

pub(crate) fn autonomous_exit_candidates_from_snapshot(
    session: &ArkSession,
    in_progress: &HashSet<UnilateralExitOutpointKey>,
) -> ArkResult<Vec<ExitCandidateDto>> {
    let snapshot = session
        .wallet_db
        .snapshot()
        .offchain_vtxo_snapshot
        .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?;
    exit_candidates_from_snapshot(&snapshot, in_progress)
}

pub(crate) async fn autonomous_build_unilateral_branch_for_leaf_tx(
    session: &ArkSession,
    leaf_txid: bitcoin::Txid,
) -> ArkResult<Vec<bitcoin::Transaction>> {
    let snapshot = session
        .wallet_db
        .snapshot()
        .offchain_vtxo_snapshot
        .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?;
    let txid = leaf_txid.to_string();
    let materials = materials_for_unroll_leaf_tx(&snapshot, &txid)
        .ok_or(ArkWasmError::AutonomousExitMaterialsMissing)?;
    let virtual_tx_outpoint = representative_virtual_tx_outpoint_for_leaf_tx(&snapshot, &txid)?;
    let target = bitcoin::OutPoint {
        txid: leaf_txid,
        vout: virtual_tx_outpoint.outpoint.vout,
    };
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

pub(crate) fn dedup_virtual_outpoints(outpoints: Vec<VirtualOutPoint>) -> Vec<VirtualOutPoint> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for outpoint in outpoints {
        if seen.insert((outpoint.txid, outpoint.vout)) {
            deduped.push(outpoint);
        }
    }
    deduped
}

pub(crate) fn virtual_outpoints_to_bitcoin(
    outpoints: &[VirtualOutPoint],
) -> ArkResult<Vec<OutPoint>> {
    let mut seen = HashSet::new();
    let mut bitcoin_outpoints = Vec::new();
    for outpoint in outpoints {
        let parsed = outpoint.to_bitcoin_outpoint();
        if seen.insert(parsed) {
            bitcoin_outpoints.push(parsed);
        }
    }
    Ok(bitcoin_outpoints)
}

pub(crate) fn validate_snapshot_completion_ready(
    snapshot: &OffchainVtxoSnapshot,
    vtxo_outpoints: &[VirtualOutPoint],
) -> ArkResult<()> {
    for outpoint in vtxo_outpoints {
        let Some(record) = snapshot.virtual_tx_outpoints.iter().find(|record| {
            record.txid == outpoint.txid.to_string() && record.vout == outpoint.vout
        }) else {
            return Err(ArkWasmError::VtxoUnilateralExitNotReady {
                txid: outpoint.txid.to_string(),
                vout: outpoint.vout,
            });
        };
        if !record.is_unrolled || record.is_spent {
            return Err(ArkWasmError::VtxoUnilateralExitNotReady {
                txid: outpoint.txid.to_string(),
                vout: outpoint.vout,
            });
        }
    }
    Ok(())
}

pub(crate) fn autonomous_validate_completion_ready(
    session: &ArkSession,
    vtxo_outpoints: &[VirtualOutPoint],
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
            script_hex: "00".to_string(),
            is_preconfirmed: true,
            is_swept: false,
            is_unrolled,
            is_spent,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
            server_pk_hex: None,
        }
    }

    fn sample_materials() -> crate::persistence::UnilateralExitMaterialsRecord {
        crate::persistence::UnilateralExitMaterialsRecord {
            cached_at: 1,
            chain_json: "{\"inner\":[]}".to_string(),
            virtual_psbts: vec![],
        }
    }

    fn sample_snapshot(records: Vec<VirtualTxOutPointRecord>) -> OffchainVtxoSnapshot {
        OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: records,
            unilateral_exit_materials_by_leaf_tx: std::collections::BTreeMap::new(),
        }
    }

    #[test]
    fn parse_vtxo_outpoints_dedupes_by_outpoint() {
        let txid = Txid::from_byte_array([0x44; 32]);
        let outpoints = vec![
            VirtualOutPoint { txid, vout: 0 },
            VirtualOutPoint { txid, vout: 0 },
            VirtualOutPoint { txid, vout: 1 },
        ];
        let parsed = virtual_outpoints_to_bitcoin(&outpoints).expect("parse outpoints");
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].vout, 0);
        assert_eq!(parsed[1].vout, 1);
    }

    #[test]
    fn validate_snapshot_completion_ready_accepts_ready_outpoint() {
        let txid = Txid::from_byte_array([0x55; 32]);
        let snapshot = sample_snapshot(vec![snapshot_record(0x55, 0, true, false)]);
        let outpoints = vec![VirtualOutPoint { txid, vout: 0 }];
        validate_snapshot_completion_ready(&snapshot, &outpoints).expect("ready outpoint");
    }

    #[test]
    fn validate_snapshot_completion_ready_rejects_unready_sibling_vout() {
        let txid = Txid::from_byte_array([0x66; 32]);
        let snapshot = sample_snapshot(vec![
            snapshot_record(0x66, 0, true, false),
            snapshot_record(0x66, 1, false, false),
        ]);
        let ready = vec![VirtualOutPoint { txid, vout: 0 }];
        validate_snapshot_completion_ready(&snapshot, &ready).expect("vout 0 ready");

        let unready = vec![VirtualOutPoint { txid, vout: 1 }];
        let error = validate_snapshot_completion_ready(&snapshot, &unready)
            .expect_err("vout 1 not unrolled");
        assert!(matches!(
            error,
            ArkWasmError::VtxoUnilateralExitNotReady { vout: 1, .. }
        ));
    }

    #[test]
    fn exit_candidates_from_snapshot_omit_leaves_without_materials() {
        let snapshot = sample_snapshot(vec![snapshot_record(0x21, 0, false, false)]);
        let rows = exit_candidates_from_snapshot(&snapshot, &HashSet::new()).expect("candidates");
        assert!(rows.is_empty());
    }

    #[test]
    fn exit_candidates_from_snapshot_include_eligible_leaves_with_materials() {
        let leaf_txid = Txid::from_byte_array([0x22; 32]).to_string();
        let mut snapshot = sample_snapshot(vec![snapshot_record(0x22, 0, false, false)]);
        snapshot
            .unilateral_exit_materials_by_leaf_tx
            .insert(leaf_txid, sample_materials());
        let rows = exit_candidates_from_snapshot(&snapshot, &HashSet::new()).expect("candidates");
        assert_eq!(rows.len(), 1);
        assert!(rows[0].can_start_unroll);
    }
}
