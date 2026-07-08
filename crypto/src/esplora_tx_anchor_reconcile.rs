//! Post-sync repair for Esplora incremental sync + BDK confirmation gaps.
//!
//! # Problem
//!
//! Esplora can show a **confirmed UTXO** while BDK still reports the receive as
//! **untrusted pending** (`confirmed` = 0, dashboard: “Pending incoming”). Sync
//! succeeds; only spendable balance is wrong.
//!
//! BDK requires **both** (1) full anchor metadata on the tx and (2) the anchor
//! block in the wallet's **local chain** before external receives become confirmed.
//! `bdk_esplora` incremental sync often learns txs from scripthash history first;
//! partial status → `seen_at`; `/tx` refetch is skipped when the txid was already
//! inserted. Chain extension can also leave wrong or missing checkpoints at anchor
//! heights.
//!
//! # Fix
//!
//! After each incremental sync, check for Esplora/BDK confirmation mismatch on
//! unconfirmed receives. Only when `/tx` reports a full confirmed anchor while BDK
//! still has the tx unconfirmed: re-fetch anchors, repair local chain through
//! Esplora, and `apply_update` with anchors **and** chain together. Mempool-only
//! receives (both agree unconfirmed) skip repair.
//!
//! Full design, shortcuts, and diagrams: `docs/esplora-bdk-anchor-reconcile.md`

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use bdk_esplora::esplora_client::{AsyncClient, Sleeper, TxStatus};
use bdk_wallet::chain::ChainPosition;
use bdk_wallet::chain::local_chain::CheckPoint;
use bdk_wallet::chain::{BlockId, ConfirmationBlockTime, TxUpdate};
use bdk_wallet::{Update, Wallet};
use bitcoin::{BlockHash, Transaction, Txid};

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

/// Txids that still need `/tx` anchor refetch and local chain extension before spendable balance.
///
/// Uses canonical relevant txs first, then unconfirmed UTXOs from [`Wallet::list_unspent`], so
/// reconcile still runs when canonicalization filters differ from balance indexing.
pub fn list_txids_for_anchor_reconcile(wallet: &Wallet) -> BTreeSet<Txid> {
    let mut txids: BTreeSet<Txid> = list_unconfirmed_canonical_txids(wallet)
        .into_iter()
        .collect();

    for local_output in wallet.list_unspent() {
        if matches!(
            local_output.chain_position,
            ChainPosition::Unconfirmed { .. }
        ) {
            txids.insert(local_output.outpoint.txid);
        }
    }

    if wallet.balance().untrusted_pending.to_sat() > 0 {
        for local_output in wallet.list_output() {
            if matches!(
                local_output.chain_position,
                ChainPosition::Unconfirmed { .. }
            ) {
                txids.insert(local_output.outpoint.txid);
            }
        }
    }

    txids
}

const TX_INFO_FETCH_ATTEMPTS: usize = 3;

async fn fetch_confirmed_tx_anchor_from_esplora<S>(
    esplora_async_client: &AsyncClient<S>,
    txid: &Txid,
) -> Result<Option<(Arc<Transaction>, ConfirmationBlockTime)>, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    let mut last_status: Option<TxStatus> = None;

    for _ in 0..TX_INFO_FETCH_ATTEMPTS {
        let Some(tx_info) = esplora_async_client
            .get_tx_info(txid)
            .await
            .map_err(|error| CryptoError::Blockchain(error.to_string()))?
        else {
            return Ok(None);
        };

        last_status = Some(tx_info.status.clone());
        if let Some(anchor) = anchor_from_confirmed_tx_status(&tx_info.status) {
            return Ok(Some((Arc::new(tx_info.to_tx()), anchor)));
        }
    }

    if let Some(status) = last_status {
        if !status.confirmed {
            return Ok(None);
        }
        return Err(CryptoError::Blockchain(format!(
            "Esplora /tx/{txid} lacks full anchor metadata after {TX_INFO_FETCH_ATTEMPTS} attempts (confirmed={}, block_height={:?}, block_hash={:?}, block_time={:?})",
            status.confirmed, status.block_height, status.block_hash, status.block_time,
        )));
    }

    Ok(None)
}

fn checkpoint_hash_at_height(tip: &CheckPoint, height: u32) -> Option<BlockHash> {
    tip.get(height).map(|checkpoint| checkpoint.hash())
}

fn insert_anchor_blocks_into_chain(
    mut tip: CheckPoint,
    anchors: &BTreeSet<(ConfirmationBlockTime, Txid)>,
) -> CheckPoint {
    for (anchor, _txid) in anchors {
        let block_id = anchor.block_id;
        if checkpoint_hash_at_height(&tip, block_id.height) != Some(block_id.hash) {
            tip = tip.insert(block_id);
        }
    }
    tip
}

async fn ensure_esplora_blocks_covering_anchors<S>(
    esplora_async_client: &AsyncClient<S>,
    latest_blocks: &BTreeMap<u32, BlockHash>,
    mut tip: CheckPoint,
    anchors: &BTreeSet<(ConfirmationBlockTime, Txid)>,
) -> Result<CheckPoint, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    tip = insert_anchor_blocks_into_chain(tip, anchors);

    let min_anchor_height = anchors
        .iter()
        .map(|(anchor, _txid)| anchor.block_id.height)
        .min()
        .unwrap_or(0);
    let max_height = latest_blocks
        .keys()
        .max()
        .copied()
        .unwrap_or(tip.height())
        .max(tip.height());

    for height in min_anchor_height..=max_height {
        let Some(esplora_hash) =
            fetch_block_hash_at_height(esplora_async_client, latest_blocks, height).await?
        else {
            continue;
        };

        if checkpoint_hash_at_height(&tip, height) != Some(esplora_hash) {
            tip = tip.insert(BlockId {
                height,
                hash: esplora_hash,
            });
        }
    }

    for (&height, &block_hash) in latest_blocks.iter() {
        if checkpoint_hash_at_height(&tip, height) != Some(block_hash) {
            tip = tip.insert(BlockId {
                height,
                hash: block_hash,
            });
        }
    }

    Ok(tip)
}

const LATEST_BLOCKS_FETCH_ATTEMPTS: usize = 3;

async fn fetch_latest_block_hashes<S>(
    esplora_async_client: &AsyncClient<S>,
) -> Result<BTreeMap<u32, BlockHash>, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    let mut last_error: Option<CryptoError> = None;

    for attempt in 0..LATEST_BLOCKS_FETCH_ATTEMPTS {
        match esplora_async_client.get_block_infos(None).await {
            Ok(block_infos) if !block_infos.is_empty() => {
                return Ok(block_infos
                    .into_iter()
                    .map(|block_info| (block_info.height, block_info.id))
                    .collect());
            }
            Ok(_) => {
                last_error = Some(CryptoError::Blockchain(
                    "Esplora /blocks returned an empty list".to_string(),
                ));
            }
            Err(error) => {
                last_error = Some(CryptoError::Blockchain(error.to_string()));
            }
        }

        let _attempt = attempt;
    }

    fetch_tip_block_hash_fallback(esplora_async_client)
        .await
        .or_else(|_| {
            last_error.map_or(
                Err(CryptoError::Blockchain(
                    "Esplora returned no blocks for chain extension".to_string(),
                )),
                Err,
            )
        })
}

async fn fetch_tip_block_hash_fallback<S>(
    esplora_async_client: &AsyncClient<S>,
) -> Result<BTreeMap<u32, BlockHash>, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    let tip_height = esplora_async_client
        .get_height()
        .await
        .map_err(|error| CryptoError::Blockchain(error.to_string()))?;
    let tip_hash = esplora_async_client
        .get_block_hash(tip_height)
        .await
        .map_err(|error| CryptoError::Blockchain(error.to_string()))?;

    let mut latest_blocks = BTreeMap::new();
    latest_blocks.insert(tip_height, tip_hash);
    Ok(latest_blocks)
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
) -> Result<CheckPoint, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    if latest_blocks.is_empty() {
        return Err(CryptoError::Blockchain(
            "Esplora returned no blocks for chain extension".to_string(),
        ));
    }

    if local_tip.height() == 0 {
        let tip = bootstrap_checkpoints_from_esplora(esplora_async_client, latest_blocks).await?;
        return ensure_esplora_blocks_covering_anchors(
            esplora_async_client,
            latest_blocks,
            tip,
            anchors,
        )
        .await;
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

    let tip = match point_of_agreement {
        Some(checkpoint) => {
            let mut connected = checkpoint;
            connected = connected
                .extend(conflicts.into_iter().rev())
                .expect("conflict heights are ascending");
            connected
        }
        None => {
            return Err(CryptoError::Blockchain(format!(
                "Esplora chain cannot connect to local tip hash {}",
                local_tip.hash()
            )));
        }
    };

    ensure_esplora_blocks_covering_anchors(esplora_async_client, latest_blocks, tip, anchors).await
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

async fn build_tx_update_from_esplora_anchors<S>(
    esplora_async_client: &AsyncClient<S>,
    txids: &[Txid],
) -> Result<TxUpdate<ConfirmationBlockTime>, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    let mut tx_update = TxUpdate::<ConfirmationBlockTime>::default();

    for txid in txids {
        let Some((transaction, anchor)) =
            fetch_confirmed_tx_anchor_from_esplora(esplora_async_client, txid).await?
        else {
            continue;
        };

        tx_update.anchors.insert((anchor, *txid));
        if !tx_update
            .txs
            .iter()
            .any(|existing_tx| existing_tx.compute_txid() == *txid)
        {
            tx_update.txs.push(transaction);
        }
    }

    Ok(tx_update)
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

    let tx_update = build_tx_update_from_esplora_anchors(esplora_async_client, txids).await?;

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
    if txids.is_empty() {
        return Ok(None);
    }

    let tx_update = build_tx_update_from_esplora_anchors(esplora_async_client, txids).await?;

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
        chain: Some(chain),
        ..Default::default()
    }))
}

/// Txids of unconfirmed UTXOs still in the wallet (candidates for reconcile / stuck checks).
pub fn unconfirmed_unspent_txids(wallet: &Wallet) -> BTreeSet<Txid> {
    wallet
        .list_unspent()
        .filter(|local_output| {
            matches!(
                local_output.chain_position,
                ChainPosition::Unconfirmed { .. }
            )
        })
        .map(|local_output| local_output.outpoint.txid)
        .collect()
}

/// Subset of `txids` whose Esplora `/tx` response includes a full confirmed anchor.
pub async fn filter_esplora_confirmed_txids<S>(
    esplora_async_client: &AsyncClient<S>,
    txids: &[Txid],
) -> Result<Vec<Txid>, CryptoError>
where
    S: Sleeper + Clone + Send + Sync,
    S::Sleep: Send,
{
    let mut confirmed_txids = BTreeSet::new();

    for txid in txids {
        let Some(tx_info) = esplora_async_client
            .get_tx_info(txid)
            .await
            .map_err(|error| CryptoError::Blockchain(error.to_string()))?
        else {
            continue;
        };

        if tx_status_has_full_esplora_anchor(&tx_info.status) {
            confirmed_txids.insert(*txid);
        }
    }

    Ok(confirmed_txids.into_iter().collect())
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
