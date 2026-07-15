use ark_core::VtxoList;

use crate::error::ArkResult;
use crate::offchain_snapshot::vtxo_list_from_snapshot;
use crate::persistence::OffchainVtxoSnapshot;
use crate::session::mappers::current_unix_timestamp;
use crate::unilateral_exit_materials::{
    clear_all_unilateral_exit_materials, clear_unilateral_exit_materials_on_ineligible_records,
    materials_record_from_prefetch, merge_unilateral_exit_materials, record_is_exit_eligible,
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

pub(crate) fn invalidate_materials_if_operator_digest_changed(
    session: &ArkSession,
    snapshot: &mut OffchainVtxoSnapshot,
    new_digest: &str,
) {
    let prior_digest = session
        .wallet_db
        .cached_operator_info()
        .map(|cached| cached.digest);
    if prior_digest.is_some_and(|digest| digest != new_digest) {
        clear_all_unilateral_exit_materials(snapshot);
    }
}

pub(crate) fn autonomous_exit_materials_status(
    snapshot: Option<&OffchainVtxoSnapshot>,
) -> (u32, u32, u32) {
    crate::unilateral_exit_materials::materials_status_from_snapshot(snapshot)
}

pub(crate) fn snapshot_vtxo_list_for_autonomous(
    snapshot: &OffchainVtxoSnapshot,
) -> ArkResult<VtxoList> {
    vtxo_list_from_snapshot(snapshot)
}

pub(crate) fn snapshot_record_is_autonomous_exit_candidate(
    record: &crate::persistence::VirtualTxOutPointRecord,
) -> bool {
    record_is_exit_eligible(record) && record.unilateral_exit_materials.is_some()
}
