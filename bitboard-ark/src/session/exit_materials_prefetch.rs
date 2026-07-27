use std::collections::HashSet;

use ark_core::VtxoList;
use bitcoin::Txid;

use crate::error::{ArkResult, ArkWasmError};
use crate::outpoint::representative_virtual_tx_outpoint_for_leaf_tx;
use crate::persistence::OffchainVtxoSnapshot;
use crate::unilateral_exit_materials::{
    materials_record_from_prefetch, pending_unilateral_exit_leaf_txids,
    prune_unilateral_exit_materials_map, snapshot_materials_for_leaf_tx,
    store_materials_for_leaf_tx,
};

use super::ArkSession;
use super::mappers::current_unix_timestamp;

pub(crate) async fn ensure_unilateral_exit_materials_for_leaf_tx(
    session: &ArkSession,
    leaf_txid: Txid,
) -> ArkResult<()> {
    let txid = leaf_txid.to_string();
    let Some(mut snapshot) = session.wallet_db.snapshot().offchain_vtxo_snapshot.clone() else {
        return Err(ArkWasmError::Snapshot("offchain snapshot missing".into()));
    };
    if snapshot_materials_for_leaf_tx(&snapshot, &txid).is_some() {
        return Ok(());
    }

    let outpoint = representative_virtual_tx_outpoint_for_leaf_tx(&snapshot, &txid)?.outpoint;
    let (chains, psbts) = session
        .client
        .prefetch_unilateral_exit_materials(outpoint)
        .await
        .map_err(crate::error::ArkWasmError::Client)?;
    let materials = materials_record_from_prefetch(current_unix_timestamp(), &chains, &psbts)?;
    store_materials_for_leaf_tx(&mut snapshot, &txid, materials);
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
    let mut prefetched_leaf_txids = HashSet::new();

    for virtual_tx_outpoint in vtxo_list.could_exit_unilaterally() {
        let txid = virtual_tx_outpoint.outpoint.txid.to_string();
        if snapshot_materials_for_leaf_tx(snapshot, &txid).is_some()
            || !prefetched_leaf_txids.insert(txid.clone())
        {
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
                        store_materials_for_leaf_tx(snapshot, &txid, materials);
                    }
                    Err(error) => warnings.push(format!(
                        "Could not store exit materials for leaf tx {txid}: {error}"
                    )),
                }
            }
            Err(error) => warnings.push(format!(
                "Could not prefetch exit materials for leaf tx {txid}: {error}"
            )),
        }
    }

    let preserve_leaf_txids =
        pending_unilateral_exit_leaf_txids(&session.wallet_db.pending_exit_deductions());
    prune_unilateral_exit_materials_map(snapshot, &preserve_leaf_txids);
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
