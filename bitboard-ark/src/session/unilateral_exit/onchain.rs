use std::str::FromStr;

use ark_client::Blockchain;
use bitcoin::Txid;

use crate::error::ArkResult;
use crate::persistence::OffchainVtxoSnapshot;

fn parse_branch_txids(branch_txids: &[String]) -> Vec<Txid> {
    branch_txids
        .iter()
        .filter_map(|txid| Txid::from_str(txid).ok())
        .collect()
}

/// Record-derived Esplora probe inputs.
#[derive(Debug, Clone)]
pub(crate) struct ExitOnChainProbe {
    pub vtxo_txid: String,
    pub vout: u32,
    pub published_vtxo_txid: Option<String>,
    pub branch_txids: Vec<String>,
}

/// True when any known unroll branch tx or the published tip is visible on Esplora.
pub(crate) async fn unroll_branch_visible_on_chain<B: Blockchain>(
    blockchain: &B,
    probe: &ExitOnChainProbe,
) -> ArkResult<bool> {
    if let Some(published_vtxo_txid) = probe.published_vtxo_txid.as_deref()
        && let Ok(target_txid) = Txid::from_str(published_vtxo_txid)
        && blockchain.find_tx(&target_txid).await?.is_some()
    {
        return Ok(true);
    }
    for branch_txid in parse_branch_txids(&probe.branch_txids) {
        if blockchain.find_tx(&branch_txid).await?.is_some() {
            return Ok(true);
        }
    }
    Ok(false)
}

/// True when the unilateral exit completion spend is visible on Esplora for this probe.
pub(crate) async fn exit_branch_spent_on_chain<B: Blockchain>(
    blockchain: &B,
    snapshot: &OffchainVtxoSnapshot,
    probe: &ExitOnChainProbe,
) -> ArkResult<bool> {
    Ok(detect_exiting_vtxo_completion_on_esplora(
        blockchain,
        snapshot,
        &probe.vtxo_txid,
        probe.vout,
    )
    .await?
    .is_some())
}

/// Returns the completion spend txid when the virtual VTXO outpoint itself is spent on-chain.
///
/// Do not infer completion from branch-tip `vout 0` spends: each unroll CPFP step spends the
/// previous parent that way, which would falsely mark exiting VTXOs as finalized.
pub(crate) async fn detect_exiting_vtxo_completion_on_esplora<B: Blockchain>(
    blockchain: &B,
    _snapshot: &OffchainVtxoSnapshot,
    host_txid: &str,
    virtual_vout: u32,
) -> ArkResult<Option<Txid>> {
    let host = Txid::from_str(host_txid)
        .map_err(|error| crate::error::ArkWasmError::InvalidTxid(error.to_string()))?;
    output_spent_on_chain(blockchain, &host, virtual_vout).await
}

pub(crate) async fn output_spent_on_chain<B: Blockchain>(
    blockchain: &B,
    txid: &Txid,
    vout: u32,
) -> ArkResult<Option<Txid>> {
    Ok(blockchain.get_output_status(txid, vout).await?.spend_txid)
}
