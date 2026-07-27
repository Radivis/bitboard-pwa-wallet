use ark_core::VtxoList;
use bitcoin::OutPoint;

use crate::error::{ArkResult, ArkWasmError};
use crate::persistence::{OffchainVtxoSnapshot, PendingExitKind};
use crate::session::mappers::current_unix_timestamp;
use crate::unilateral_exit_materials::{
    apply_unilateral_exit_materials_to_leaf_tx,
    clear_unilateral_exit_materials_on_ineligible_records, materials_record_from_prefetch,
    snapshot_materials_vout_for_leaf_tx,
};

use super::ArkSession;
use std::collections::HashSet;

pub(crate) async fn ensure_unilateral_exit_materials_for_outpoint(
    session: &ArkSession,
    outpoint: OutPoint,
) -> ArkResult<()> {
    let txid = outpoint.txid.to_string();
    let vout = outpoint.vout;
    let Some(mut snapshot) = session.wallet_db.snapshot().offchain_vtxo_snapshot.clone() else {
        return Err(ArkWasmError::Snapshot("offchain snapshot missing".into()));
    };
    if snapshot_materials_vout_for_leaf_tx(&snapshot, &txid, vout).is_some() {
        return Ok(());
    }

    let (chains, psbts) = session
        .client
        .prefetch_unilateral_exit_materials(outpoint)
        .await
        .map_err(crate::error::ArkWasmError::Client)?;
    let materials = materials_record_from_prefetch(current_unix_timestamp(), &chains, &psbts)?;
    if !apply_unilateral_exit_materials_to_leaf_tx(&mut snapshot, &txid, materials) {
        return Err(ArkWasmError::AutonomousExitMaterialsMissing);
    }
    session.wallet_db.set_offchain_vtxo_snapshot(snapshot);
    Ok(())
}

pub(crate) async fn prefetch_unilateral_exit_materials_for_snapshot(
    session: &ArkSession,
    snapshot: &mut OffchainVtxoSnapshot,
    vtxo_list: &VtxoList,
) -> Option<String> {
    let mut warnings = Vec::new();
    let synced_at = current_unix_timestamp();

    for virtual_tx_outpoint in vtxo_list.could_exit_unilaterally() {
        let txid = virtual_tx_outpoint.outpoint.txid.to_string();
        let vout = virtual_tx_outpoint.outpoint.vout;
        let Some(record) = snapshot
            .virtual_tx_outpoints
            .iter_mut()
            .find(|record| record.txid == txid && record.vout == vout)
        else {
            continue;
        };
        if record.unilateral_exit_materials.is_some() {
            continue;
        }

        match session
            .client
            .prefetch_unilateral_exit_materials(virtual_tx_outpoint.outpoint)
            .await
        {
            Ok((chains, psbts)) => {
                match materials_record_from_prefetch(synced_at, &chains, &psbts) {
                    Ok(materials) => {
                        apply_unilateral_exit_materials_to_leaf_tx(snapshot, &txid, materials);
                    }
                    Err(error) => warnings.push(format!(
                        "Could not store exit materials for {txid}:{vout}: {error}"
                    )),
                }
            }
            Err(error) => warnings.push(format!(
                "Could not prefetch exit materials for {txid}:{vout}: {error}"
            )),
        }
    }

    let preserve_materials_outpoints: HashSet<(String, u32)> = session
        .wallet_db
        .pending_exit_deductions()
        .iter()
        .filter_map(|record| {
            if record.kind != PendingExitKind::Unilateral {
                return None;
            }
            Some((record.vtxo_txid.clone()?, record.vout?))
        })
        .collect();
    clear_unilateral_exit_materials_on_ineligible_records(snapshot, &preserve_materials_outpoints);
    if warnings.is_empty() {
        None
    } else {
        Some(warnings.join("\n"))
    }
}

pub(crate) fn autonomous_exit_materials_status(
    snapshot: Option<&OffchainVtxoSnapshot>,
) -> (u32, u32, u32) {
    crate::unilateral_exit_materials::materials_status_from_snapshot(snapshot)
}
