//! Esplora exposes transaction confirmation metadata inconsistently across HTTP endpoints.
//!
//! Incremental sync (`bdk_esplora`) learns txs from `scripthash_txs` first. When that payload
//! lacks `block_hash` or `block_time`, the tx is recorded as `seen_at` (untrusted pending).
//! The same tx's `/tx/{txid}` response may already include full anchor fields, but sync skips
//! `/tx` refetch when the txid was inserted in the scripthash pass (`inserted_txs` guard).
//!
//! Even when anchors are applied later, BDK only promotes receives to spendable confirmed balance
//! when the anchor block exists in the wallet's local chain. Incremental sync can skip chain
//! extension when the wallet had no chain tip at sync start; this module repairs both gaps.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use bdk_esplora::esplora_client::{AsyncClient, Sleeper, TxStatus};
use bdk_wallet::chain::ChainPosition;
use bdk_wallet::chain::local_chain::CheckPoint;
use bdk_wallet::chain::{BlockId, ConfirmationBlockTime, TxUpdate};
use bdk_wallet::{Update, Wallet};
use bitcoin::{BlockHash, Txid};

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

async fn fetch_latest_block_hashes<S>(
    esplora_async_client: &AsyncClient<S>,
) -> Result<BTreeMap<u32, BlockHash>, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    Ok(esplora_async_client
        .get_block_infos(None)
        .await
        .map_err(|error| CryptoError::Blockchain(error.to_string()))?
        .into_iter()
        .map(|block_info| (block_info.height, block_info.id))
        .collect())
}

async fn fetch_block_hash_at_height<S>(
    esplora_async_client: &AsyncClient<S>,
    latest_blocks: &BTreeMap<u32, BlockHash>,
    height: u32,
) -> Result<Option<BlockHash>, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    if let Some(block_hash) = latest_blocks.get(&height) {
        return Ok(Some(*block_hash));
    }

    let Some(tip_height) = latest_blocks.keys().last().copied() else {
        return Ok(None);
    };
    if height > tip_height {
        return Ok(None);
    }

    esplora_async_client
        .get_block_hash(height)
        .await
        .map(Some)
        .or_else(|error| {
            if matches!(
                error,
                bdk_esplora::esplora_client::Error::HttpResponse { status: 404, .. }
            ) {
                Ok(None)
            } else {
                Err(CryptoError::Blockchain(error.to_string()))
            }
        })
}

/// Extend the wallet's local chain so anchor blocks and Esplora tip are connected.
async fn build_local_chain_extension<S>(
    esplora_async_client: &AsyncClient<S>,
    latest_blocks: &BTreeMap<u32, BlockHash>,
    local_tip: &CheckPoint,
    anchors: &BTreeSet<(ConfirmationBlockTime, Txid)>,
) -> Result<Option<CheckPoint>, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    if latest_blocks.is_empty() {
        return Ok(None);
    }

    if local_tip.height() == 0 {
        let mut tip =
            bootstrap_checkpoints_from_esplora(esplora_async_client, latest_blocks).await?;
        for (anchor, _txid) in anchors {
            let anchor_height = anchor.block_id.height;
            if tip.get(anchor_height).is_none() {
                let Some(block_hash) =
                    fetch_block_hash_at_height(esplora_async_client, latest_blocks, anchor_height)
                        .await?
                else {
                    continue;
                };
                tip = tip.insert(BlockId {
                    height: anchor_height,
                    hash: block_hash,
                });
            }
        }
        for (&height, &block_hash) in latest_blocks.iter() {
            tip = tip.insert(BlockId {
                height,
                hash: block_hash,
            });
        }
        return Ok(Some(tip));
    }

    let mut point_of_agreement = None;
    let mut conflicts = Vec::new();

    for local_checkpoint in local_tip.iter() {
        let remote_hash = match fetch_block_hash_at_height(
            esplora_async_client,
            latest_blocks,
            local_checkpoint.height(),
        )
        .await?
        {
            Some(block_hash) => block_hash,
            None => continue,
        };
        if remote_hash == local_checkpoint.hash() {
            point_of_agreement = Some(local_checkpoint);
            break;
        }
        conflicts.push(BlockId {
            height: local_checkpoint.height(),
            hash: remote_hash,
        });
    }

    let mut tip = match point_of_agreement {
        Some(checkpoint) => {
            let mut connected = checkpoint;
            connected = connected
                .extend(conflicts.into_iter().rev())
                .expect("conflict heights are ascending");
            connected
        }
        None => bootstrap_checkpoints_from_esplora(esplora_async_client, latest_blocks).await?,
    };

    for (anchor, _txid) in anchors {
        let anchor_height = anchor.block_id.height;
        if tip.get(anchor_height).is_none() {
            let Some(block_hash) =
                fetch_block_hash_at_height(esplora_async_client, latest_blocks, anchor_height)
                    .await?
            else {
                continue;
            };
            tip = tip.insert(BlockId {
                height: anchor_height,
                hash: block_hash,
            });
        }
    }

    for (&height, &block_hash) in latest_blocks.iter() {
        tip = tip.insert(BlockId {
            height,
            hash: block_hash,
        });
    }

    Ok(Some(tip))
}

fn bootstrap_checkpoints_from_latest_blocks_only(
    latest_blocks: &BTreeMap<u32, BlockHash>,
) -> Result<CheckPoint, CryptoError> {
    let mut tip: Option<CheckPoint> = None;
    for (&height, &block_hash) in latest_blocks.iter() {
        let block_id = BlockId {
            height,
            hash: block_hash,
        };
        tip = Some(match tip {
            None => CheckPoint::new(block_id),
            Some(existing_tip) => existing_tip.insert(block_id),
        });
    }

    tip.ok_or_else(|| {
        CryptoError::Blockchain("Esplora returned no blocks for chain bootstrap".to_string())
    })
}

async fn bootstrap_checkpoints_from_esplora<S>(
    esplora_async_client: &AsyncClient<S>,
    latest_blocks: &BTreeMap<u32, BlockHash>,
) -> Result<CheckPoint, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    let max_height = latest_blocks.keys().max().copied().unwrap_or(0);
    let mut tip: Option<CheckPoint> = None;

    for height in 0..=max_height {
        let block_hash = if let Some(block_hash) = latest_blocks.get(&height) {
            *block_hash
        } else {
            match fetch_block_hash_at_height(esplora_async_client, latest_blocks, height).await? {
                Some(block_hash) => block_hash,
                None => continue,
            }
        };
        let block_id = BlockId {
            height,
            hash: block_hash,
        };
        tip = Some(match tip {
            None => CheckPoint::new(block_id),
            Some(existing_tip) => existing_tip.insert(block_id),
        });
    }

    if let Some(bootstrapped_tip) = tip {
        return Ok(bootstrapped_tip);
    }

    bootstrap_checkpoints_from_latest_blocks_only(latest_blocks)
}

/// Returns a wallet update when `/tx` reports confirmed anchors for still-unconfirmed txs.
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

/// Re-fetch `/tx` anchors and extend local chain so confirmed receives become spendable.
pub async fn build_anchor_and_chain_reconcile_update<S>(
    local_chain_tip: &CheckPoint,
    esplora_async_client: &AsyncClient<S>,
    txids: &[Txid],
) -> Result<Option<Update>, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
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

    let latest_blocks = fetch_latest_block_hashes(esplora_async_client).await?;
    let chain = build_local_chain_extension(
        esplora_async_client,
        &latest_blocks,
        local_chain_tip,
        &tx_update.anchors,
    )
    .await?;

    Ok(Some(Update {
        tx_update,
        chain,
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
