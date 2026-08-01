use std::collections::HashSet;
use std::str::FromStr;

use ark_client::Blockchain;
use ark_core::build_unilateral_exit_tree_txids;
use bitcoin::Txid;

use crate::error::ArkResult;
use crate::offchain_snapshot::mark_virtual_tx_vtxos_unrolled_in_snapshot;
use crate::persistence::{OffchainVtxoSnapshot, UnilateralExitWatchRecord};
use crate::session::unilateral_exit_branch_topology::{
    terminal_vtxo_host_txids_from_materials_snapshot, virtual_tx_type_hosts_exit_outpoints,
};
use crate::unilateral_exit_materials::{
    chained_tx_type_label, snapshot_materials_for_leaf_tx, vtxo_chains_from_json,
};

use super::exit_watch::parse_branch_txids;

const UNILATERAL_EXIT_ON_CHAIN_TIP_VOUT: u32 = 0;

/// True when any known unroll branch tx or the published tip is visible on Esplora.
pub(crate) async fn unroll_branch_visible_on_chain<B: Blockchain>(
    blockchain: &B,
    watch: &UnilateralExitWatchRecord,
) -> ArkResult<bool> {
    if let Some(published_vtxo_txid) = watch.published_vtxo_txid.as_deref()
        && let Ok(target_txid) = Txid::from_str(published_vtxo_txid)
        && blockchain.find_tx(&target_txid).await?.is_some()
    {
        return Ok(true);
    }
    for branch_txid in parse_branch_txids(watch) {
        if blockchain.find_tx(&branch_txid).await?.is_some() {
            return Ok(true);
        }
    }
    Ok(false)
}

/// True when the unilateral exit completion spend is visible on Esplora for this watch.
pub(crate) async fn exit_branch_spent_on_chain<B: Blockchain>(
    blockchain: &B,
    snapshot: &OffchainVtxoSnapshot,
    watch: &UnilateralExitWatchRecord,
) -> ArkResult<bool> {
    Ok(detect_exiting_vtxo_completion_on_esplora(
        blockchain,
        snapshot,
        Some(watch),
        &watch.vtxo_txid,
        watch.vout,
    )
    .await?
    .is_some())
}

/// Candidate on-chain tip txids to probe for a completed unilateral exit, most likely first.
pub(crate) fn exiting_vtxo_on_chain_tip_candidates(
    snapshot: &OffchainVtxoSnapshot,
    leaf_txid: &str,
    watch: Option<&UnilateralExitWatchRecord>,
) -> Vec<Txid> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    let mut push_candidate = |txid: Txid| {
        if seen.insert(txid) {
            candidates.push(txid);
        }
    };

    if let Some(watch) = watch {
        if let Some(published_vtxo_txid) = watch.published_vtxo_txid.as_deref()
            && let Ok(published_txid) = Txid::from_str(published_vtxo_txid)
        {
            push_candidate(published_txid);
        }
        for branch_txid in parse_branch_txids(watch).into_iter().rev() {
            push_candidate(branch_txid);
        }
    }

    if let Ok(leaf) = Txid::from_str(leaf_txid) {
        push_candidate(leaf);
    }

    for branch_txid in branch_txid_hints_from_materials(snapshot, leaf_txid)
        .into_iter()
        .rev()
    {
        push_candidate(branch_txid);
    }

    candidates
}

fn branch_txid_hints_from_materials(snapshot: &OffchainVtxoSnapshot, leaf_txid: &str) -> Vec<Txid> {
    let Some(materials) = snapshot_materials_for_leaf_tx(snapshot, leaf_txid) else {
        return Vec::new();
    };
    let Ok(chains) = vtxo_chains_from_json(&materials.chain_json) else {
        return Vec::new();
    };
    let Ok(leaf) = Txid::from_str(leaf_txid) else {
        return Vec::new();
    };
    let Ok(paths) = build_unilateral_exit_tree_txids(&chains, leaf) else {
        return Vec::new();
    };
    paths.into_iter().flatten().collect()
}

/// Returns the completion spend txid when the virtual VTXO outpoint itself is spent on-chain.
///
/// Do not infer completion from branch-tip `vout 0` spends: each unroll CPFP step spends the
/// previous parent that way, which would falsely mark exiting VTXOs as finalized.
pub(crate) async fn detect_exiting_vtxo_completion_on_esplora<B: Blockchain>(
    blockchain: &B,
    _snapshot: &OffchainVtxoSnapshot,
    _watch: Option<&UnilateralExitWatchRecord>,
    leaf_txid: &str,
    virtual_vout: u32,
) -> ArkResult<Option<Txid>> {
    let leaf = Txid::from_str(leaf_txid)
        .map_err(|error| crate::error::ArkWasmError::InvalidTxid(error.to_string()))?;
    output_spent_on_chain(blockchain, &leaf, virtual_vout).await
}

/// Clears local `is_spent` markers that were set without an on-chain spend on the VTXO outpoint.
pub(crate) async fn heal_false_positive_exiting_vtxo_spent_markers<B: Blockchain>(
    blockchain: &B,
    snapshot: &mut OffchainVtxoSnapshot,
) -> ArkResult<Vec<bitcoin::OutPoint>> {
    let mut healed_outpoints = Vec::new();
    for record in &mut snapshot.virtual_tx_outpoints {
        if !record.is_spent || !record.is_unrolled {
            continue;
        }
        let Ok(txid) = Txid::from_str(&record.txid) else {
            continue;
        };
        if output_spent_on_chain(blockchain, &txid, record.vout)
            .await?
            .is_some()
        {
            continue;
        }
        record.is_spent = false;
        record.spent_by = None;
        healed_outpoints.push(bitcoin::OutPoint {
            txid,
            vout: record.vout,
        });
    }
    Ok(healed_outpoints)
}

/// Returns the completion spend txid when any candidate tip's primary output is spent on-chain.
///
/// Reserved for explicit published-tip probes; unilateral exit completion detection must not use
/// branch-tip `vout 0` spends because CPFP bump children spend those during unroll.
pub(crate) async fn find_unilateral_exit_completion_spend_on_chain<B: Blockchain>(
    blockchain: &B,
    tip_candidates: &[Txid],
    skip_txid: &str,
    skip_vout: u32,
) -> ArkResult<Option<Txid>> {
    let Ok(skip_txid) = Txid::from_str(skip_txid) else {
        return Ok(None);
    };
    for tip_txid in tip_candidates {
        if *tip_txid == skip_txid && UNILATERAL_EXIT_ON_CHAIN_TIP_VOUT == skip_vout {
            continue;
        }
        if let Some(spend_txid) =
            output_spent_on_chain(blockchain, tip_txid, UNILATERAL_EXIT_ON_CHAIN_TIP_VOUT).await?
        {
            return Ok(Some(spend_txid));
        }
    }
    Ok(None)
}

async fn output_spent_on_chain<B: Blockchain>(
    blockchain: &B,
    txid: &Txid,
    vout: u32,
) -> ArkResult<Option<Txid>> {
    Ok(blockchain.get_output_status(txid, vout).await?.spend_txid)
}

/// When an upstream vtxo-host virtual tx (`tree` or `ark`) in an exit branch is confirmed on
/// Esplora, mark its VTXOs unrolled so they cannot be started as a separate unilateral exit.
pub(crate) async fn reconcile_intermediate_ark_virtual_txs_unrolled_on_esplora<B: Blockchain>(
    blockchain: &B,
    snapshot: &mut OffchainVtxoSnapshot,
) -> ArkResult<()> {
    let material_leaf_txids: Vec<String> = snapshot
        .unilateral_exit_materials_by_leaf_tx
        .keys()
        .cloned()
        .collect();
    if material_leaf_txids.is_empty() {
        return Ok(());
    }

    let terminal_txids =
        terminal_vtxo_host_txids_from_materials_snapshot(snapshot, &material_leaf_txids)?;

    for leaf_txid in material_leaf_txids {
        let Some(materials) = snapshot_materials_for_leaf_tx(snapshot, &leaf_txid) else {
            continue;
        };
        let Ok(chains) = vtxo_chains_from_json(&materials.chain_json) else {
            continue;
        };

        for link in &chains.inner {
            let tx_type = chained_tx_type_label(&link.tx_type);
            if !virtual_tx_type_hosts_exit_outpoints(&tx_type) {
                continue;
            }
            let txid = link.txid.to_string();
            if terminal_txids.contains(&txid) {
                continue;
            }
            if blockchain
                .find_tx(&link.txid)
                .await
                .map_err(crate::error::ArkWasmError::Client)?
                .is_some()
            {
                mark_virtual_tx_vtxos_unrolled_in_snapshot(snapshot, &txid);
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::{OffchainVtxoSnapshot, UnilateralExitMaterialsRecord};
    use crate::unilateral_exit_materials::{store_materials_for_leaf_tx, vtxo_chains_to_json};
    use ark_core::server::{ChainedTxType, VtxoChain, VtxoChains};
    use bitcoin::hashes::Hash;
    use std::collections::BTreeMap;

    #[test]
    fn exiting_tip_candidates_prefers_watch_published_then_leaf_then_branch_hints() {
        let commitment = Txid::from_byte_array([0x01; 32]);
        let tree = Txid::from_byte_array([0x02; 32]);
        let leaf_txid = Txid::from_byte_array([0x03; 32]);
        let published = Txid::from_byte_array([0x04; 32]);
        let chains = VtxoChains {
            inner: vec![
                VtxoChain {
                    txid: commitment,
                    tx_type: ChainedTxType::Commitment,
                    spends: vec![],
                    expires_at: 0,
                },
                VtxoChain {
                    txid: tree,
                    tx_type: ChainedTxType::Tree,
                    spends: vec![commitment],
                    expires_at: 0,
                },
                VtxoChain {
                    txid: leaf_txid,
                    tx_type: ChainedTxType::Ark,
                    spends: vec![tree],
                    expires_at: 0,
                },
            ],
        };
        let chain_json = vtxo_chains_to_json(&chains).expect("encode");
        let mut snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![],
            unilateral_exit_materials_by_leaf_tx: BTreeMap::new(),
        };
        store_materials_for_leaf_tx(
            &mut snapshot,
            &leaf_txid.to_string(),
            UnilateralExitMaterialsRecord {
                cached_at: 1,
                chain_json,
                virtual_psbts: vec![],
            },
        );
        let watch = UnilateralExitWatchRecord {
            vtxo_txid: leaf_txid.to_string(),
            vout: 0,
            amount_sats: 50_000,
            registered_at: 1,
            published_vtxo_txid: Some(published.to_string()),
            branch_txids: vec![tree.to_string()],
        };

        let candidates =
            exiting_vtxo_on_chain_tip_candidates(&snapshot, &leaf_txid.to_string(), Some(&watch));

        assert_eq!(candidates, vec![published, tree, leaf_txid]);
    }

    #[test]
    fn exiting_tip_candidates_without_materials_uses_leaf_only() {
        let leaf_txid = Txid::from_byte_array([0x44; 32]);
        let snapshot = OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![],
            unilateral_exit_materials_by_leaf_tx: BTreeMap::new(),
        };

        let candidates =
            exiting_vtxo_on_chain_tip_candidates(&snapshot, &leaf_txid.to_string(), None);

        assert_eq!(candidates, vec![leaf_txid]);
    }
}
