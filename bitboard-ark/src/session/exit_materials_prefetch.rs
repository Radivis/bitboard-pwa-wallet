use ark_core::VtxoList;

use crate::persistence::OffchainVtxoSnapshot;
use crate::session::mappers::current_unix_timestamp;
use crate::unilateral_exit_materials::{
    clear_unilateral_exit_materials_on_ineligible_records, materials_record_from_prefetch,
};

use super::ArkSession;

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
                    Ok(materials) => record.unilateral_exit_materials = Some(materials),
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

    clear_unilateral_exit_materials_on_ineligible_records(snapshot);
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
