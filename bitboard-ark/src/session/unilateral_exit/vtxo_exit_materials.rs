//! Materials-chain walks for VTXO exit records (`ARK-EXIT-33`).

use std::collections::HashSet;

use ark_core::server::VtxoChains;

use crate::error::{ArkResult, ArkWasmError};
use crate::persistence::OffchainVtxoSnapshot;
use crate::session::unilateral_exit::topology::virtual_tx_type_hosts_exit_outpoints;
use crate::unilateral_exit_materials::{chained_tx_type_label, vtxo_chains_from_json};

fn materials_chains_containing_host(
    snapshot: &OffchainVtxoSnapshot,
    seed_host_txid: &str,
) -> Vec<VtxoChains> {
    snapshot
        .unilateral_exit_materials_by_leaf_tx
        .values()
        .filter_map(|materials| {
            let chains = vtxo_chains_from_json(&materials.chain_json).ok()?;
            let chain_includes_seed = chains
                .inner
                .iter()
                .any(|link| link.txid.to_string() == seed_host_txid);
            if chain_includes_seed {
                Some(chains)
            } else {
                None
            }
        })
        .collect()
}

/// Host txids of `tree` / `ark` links in any materials chain that includes `seed_host_txid`.
///
/// Missing or unusable materials is a hard failure: do not invent a one-txid branch.
pub fn host_txids_on_same_materials_branch(
    snapshot: &OffchainVtxoSnapshot,
    seed_host_txid: &str,
) -> ArkResult<HashSet<String>> {
    let mut host_txids = HashSet::new();
    for chains in materials_chains_containing_host(snapshot, seed_host_txid) {
        for link in &chains.inner {
            let tx_type = chained_tx_type_label(&link.tx_type);
            if virtual_tx_type_hosts_exit_outpoints(&tx_type) {
                host_txids.insert(link.txid.to_string());
            }
        }
    }
    if host_txids.is_empty() {
        return Err(ArkWasmError::AutonomousExitMaterialsMissing);
    }
    Ok(host_txids)
}

/// All chain-link txids from materials whose chain includes `seed_host_txid` (Esplora unroll-visible probes).
pub fn materials_chain_txid_strings_for_host(
    snapshot: &OffchainVtxoSnapshot,
    seed_host_txid: &str,
) -> Vec<String> {
    let mut txids = Vec::new();
    let mut seen = HashSet::new();
    let push = |txid: String, txids: &mut Vec<String>, seen: &mut HashSet<String>| {
        if seen.insert(txid.clone()) {
            txids.push(txid);
        }
    };
    push(seed_host_txid.to_string(), &mut txids, &mut seen);
    for chains in materials_chains_containing_host(snapshot, seed_host_txid) {
        for link in &chains.inner {
            push(link.txid.to_string(), &mut txids, &mut seen);
        }
    }
    txids
}
