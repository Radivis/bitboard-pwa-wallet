use std::collections::HashSet;

use ark_core::VtxoList;

use crate::persistence::OffchainVtxoSnapshot;
use crate::unilateral_exit_materials::{
    materials_record_from_prefetch, pending_unilateral_exit_leaf_txids,
    prune_unilateral_exit_materials_map, snapshot_materials_for_leaf_tx,
    store_materials_for_leaf_tx,
};

use super::ArkSession;
use super::mappers::current_unix_timestamp;

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
