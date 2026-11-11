//! Wallet sync abstraction over a [`BlockchainClient`].
//!
//! This module is used by **integration tests** (e.g. `tests/esplora_tests.rs`) so they can
//! pass a mock `BlockchainClient`. The WASM entrypoints in `lib.rs` build the same request
//! shape (`_at(now)`) and use [`apply_update`] for the apply step; tests go through the
//! trait with the same `now` so production and tests exercise the same code path.

use bdk_wallet::chain::local_chain::{CannotConnectError, CheckPoint, LocalChain};
use bdk_wallet::{Update, Wallet};

use crate::blockchain::BlockchainClient;
use crate::error::CryptoError;
use crate::esplora_network_identity;
use crate::types::BitcoinNetwork;

/// Applies a blockchain update to the wallet. Shared by the sync module and by `lib.rs`
/// so apply logic lives in one place.
pub fn apply_update(wallet: &mut Wallet, update: Update) -> Result<(), CryptoError> {
    reject_update_forking_at_genesis(wallet, &update)?;
    wallet
        .apply_update(update)
        .map_err(esplora_chain_mismatch_from_cannot_connect)
}

/// Applies an Esplora sync or full-scan update after checking that the server serves
/// `app_network` (see [`esplora_network_identity`]). Nothing is applied on mismatch.
pub fn apply_esplora_update(
    wallet: &mut Wallet,
    app_network: Option<BitcoinNetwork>,
    update: Update,
) -> Result<(), CryptoError> {
    esplora_network_identity::check_update_matches_network(app_network, &update)?;
    apply_update(wallet, update)
}

/// Public Signet and Mutinynet share the signet genesis block, so BDK replaces the whole
/// local chain when it receives the other chain's headers. The confirmed history then no
/// longer matches any checkpoint and silently turns pending. A real reorg never reaches
/// genesis, so only wallets with confirmed transactions are protected, and only against
/// an update that leaves no original checkpoint above genesis.
fn reject_update_forking_at_genesis(wallet: &Wallet, update: &Update) -> Result<(), CryptoError> {
    let Some(update_chain) = update.chain.as_ref() else {
        return Ok(());
    };
    if !wallet_has_confirmed_transactions(wallet) {
        return Ok(());
    }

    let original_chain = wallet.local_chain();
    let mut merged_chain = original_chain.clone();
    merged_chain
        .apply_update(update_chain.clone())
        .map_err(esplora_chain_mismatch_from_cannot_connect)?;

    if keeps_an_original_checkpoint_above_genesis(original_chain, &merged_chain.tip()) {
        return Ok(());
    }
    Err(CryptoError::EsploraChainMismatch(
        "the Esplora chain replaces every saved block above genesis, so it is a different chain"
            .to_string(),
    ))
}

fn wallet_has_confirmed_transactions(wallet: &Wallet) -> bool {
    wallet
        .transactions()
        .any(|wallet_tx| wallet_tx.chain_position.is_confirmed())
}

fn keeps_an_original_checkpoint_above_genesis(
    original_chain: &LocalChain,
    merged_tip: &CheckPoint,
) -> bool {
    original_chain
        .iter_checkpoints()
        .filter(|checkpoint| checkpoint.height() > 0)
        .any(|checkpoint| {
            merged_tip
                .get(checkpoint.height())
                .is_some_and(|merged| merged.hash() == checkpoint.hash())
        })
}

fn esplora_chain_mismatch_from_cannot_connect(error: CannotConnectError) -> CryptoError {
    CryptoError::EsploraChainMismatch(error.to_string())
}

pub async fn sync_wallet(
    wallet: &mut Wallet,
    client: &dyn BlockchainClient,
    parallel_requests: usize,
) -> Result<(), CryptoError> {
    let now = crate::current_unix_time();
    // Peeked receive index 0 is not in `start_sync_with_revealed_spks` until revealed.
    crate::wallet::ensure_current_external_address(wallet);
    let update = client.sync(wallet, now, parallel_requests).await?;
    apply_update(wallet, update)?;
    Ok(())
}

pub async fn full_scan_wallet(
    wallet: &mut Wallet,
    client: &dyn BlockchainClient,
    stop_gap: usize,
    parallel_requests: usize,
) -> Result<(), CryptoError> {
    let now = crate::current_unix_time();
    let update = client
        .full_scan(wallet, stop_gap, now, parallel_requests)
        .await?;
    apply_update(wallet, update)?;
    Ok(())
}
