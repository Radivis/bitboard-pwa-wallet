//! Esplora exposes transaction confirmation metadata inconsistently across HTTP endpoints.
//!
//! Incremental sync (`bdk_esplora`) learns txs from `scripthash_txs` first. When that payload
//! lacks `block_hash` or `block_time`, the tx is recorded as `seen_at` (untrusted pending).
//! The same tx's `/tx/{txid}` response may already include full anchor fields, but sync skips
//! `/tx` refetch when the txid was inserted in the scripthash pass (`inserted_txs` guard).
//!
//! After a normal sync, re-fetch `/tx` for still-unconfirmed wallet txs and apply anchors.

use std::sync::Arc;

use bdk_esplora::esplora_client::{AsyncClient, Sleeper, TxStatus};
use bdk_wallet::chain::ChainPosition;
use bdk_wallet::chain::{BlockId, ConfirmationBlockTime, TxUpdate};
use bdk_wallet::{Update, Wallet};
use bitcoin::Txid;

use crate::error::CryptoError;

pub fn tx_status_has_full_esplora_anchor(status: &TxStatus) -> bool {
    status.confirmed
        && status.block_height.is_some()
        && status.block_hash.is_some()
        && status.block_time.is_some()
}

fn anchor_from_confirmed_tx_status(status: &TxStatus) -> Option<ConfirmationBlockTime> {
    if !tx_status_has_full_esplora_anchor(status) {
        return None;
    }
    Some(ConfirmationBlockTime {
        block_id: BlockId {
            height: status.block_height?,
            hash: status.block_hash?,
        },
        confirmation_time: status.block_time?,
    })
}

pub fn list_unconfirmed_canonical_txids(wallet: &Wallet) -> Vec<Txid> {
    wallet
        .transactions()
        .filter(|wallet_tx| matches!(wallet_tx.chain_position, ChainPosition::Unconfirmed { .. }))
        .map(|wallet_tx| wallet_tx.tx_node.txid)
        .collect()
}

/// Returns a wallet update when `/tx` reports confirmed anchors for the given txids.
pub async fn build_anchor_reconcile_update_for_txids<S>(
    esplora_async_client: &AsyncClient<S>,
    txids: &[Txid],
) -> Result<Option<Update>, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    if txids.is_empty() {
        return Ok(None);
    }

    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();

    for txid in txids {
        let Some(tx_info) = esplora_async_client
            .get_tx_info(txid)
            .await
            .map_err(|error| CryptoError::Blockchain(error.to_string()))?
        else {
            continue;
        };

        let Some(anchor) = anchor_from_confirmed_tx_status(&tx_info.status) else {
            continue;
        };

        tx_update.anchors.insert((anchor, *txid));
        if !tx_update
            .txs
            .iter()
            .any(|transaction| transaction.compute_txid() == *txid)
        {
            tx_update.txs.push(Arc::new(tx_info.to_tx()));
        }
    }

    if tx_update.anchors.is_empty() {
        return Ok(None);
    }

    Ok(Some(Update {
        tx_update,
        ..Default::default()
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tx_status_has_full_esplora_anchor_requires_all_fields() {
        use bitcoin::BlockHash;
        use bitcoin::hashes::Hash;

        assert!(tx_status_has_full_esplora_anchor(&TxStatus {
            confirmed: true,
            block_height: Some(195),
            block_hash: Some(BlockHash::all_zeros()),
            block_time: Some(1_700_000_000),
        }));

        assert!(!tx_status_has_full_esplora_anchor(&TxStatus {
            confirmed: true,
            block_height: Some(195),
            block_hash: None,
            block_time: Some(1_700_000_000),
        }));
    }
}
