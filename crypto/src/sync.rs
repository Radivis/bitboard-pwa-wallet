//! Wallet sync abstraction over a [`BlockchainClient`].
//!
//! This module is used by **integration tests** (e.g. `tests/esplora_tests.rs`) so they can
//! pass a mock `BlockchainClient`. The WASM entrypoints in `lib.rs` build the same request
//! shape (`_at(now)`) and use [`apply_update`] for the apply step; tests go through the
//! trait with the same `now` so production and tests exercise the same code path.

use bdk_wallet::{Update, Wallet};

use crate::blockchain::BlockchainClient;
use crate::error::CryptoError;

/// Applies a blockchain update to the wallet. Shared by the sync module and by `lib.rs`
/// so apply logic lives in one place.
pub fn apply_update(wallet: &mut Wallet, update: Update) -> Result<(), CryptoError> {
    wallet
        .apply_update(update)
        .map_err(|e| CryptoError::Blockchain(e.to_string()))
}

pub async fn sync_wallet(
    wallet: &mut Wallet,
    client: &dyn BlockchainClient,
    parallel_requests: usize,
) -> Result<(), CryptoError> {
    let now = crate::current_unix_time();
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
