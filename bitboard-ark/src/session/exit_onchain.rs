use std::str::FromStr;

use ark_client::Blockchain;
use bitcoin::Txid;

use crate::error::ArkResult;
use crate::persistence::UnilateralExitWatchRecord;

use super::exit_watch::parse_branch_txids;

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

/// True when the published unroll tip is on-chain and its primary output is spent (exit claimed).
pub(crate) async fn exit_branch_spent_on_chain<B: Blockchain>(
    blockchain: &B,
    watch: &UnilateralExitWatchRecord,
) -> ArkResult<bool> {
    let Some(published_vtxo_txid) = watch.published_vtxo_txid.as_deref() else {
        return Ok(false);
    };
    let Ok(target_txid) = Txid::from_str(published_vtxo_txid) else {
        return Ok(false);
    };
    if blockchain.find_tx(&target_txid).await?.is_none() {
        return Ok(false);
    }
    Ok(blockchain
        .get_output_status(&target_txid, 0)
        .await?
        .spend_txid
        .is_some())
}
