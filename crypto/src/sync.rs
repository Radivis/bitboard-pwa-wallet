//! Wallet sync abstraction over a [`BlockchainClient`].
//!
//! This module is used by **integration tests** (e.g. `tests/esplora_tests.rs`) so they can
//! pass a mock `BlockchainClient`. The WASM entrypoints in `lib.rs` (`sync_wallet` and
//! `full_scan_wallet`) do not use this module; they call `EsploraClient` directly to avoid
//! passing a trait object across the WASM boundary.

use bdk_wallet::Wallet;

use crate::blockchain::BlockchainClient;
use crate::error::CryptoError;

pub async fn sync_wallet(
    wallet: &mut Wallet,
    client: &dyn BlockchainClient,
    parallel_requests: usize,
) -> Result<(), CryptoError> {
    let update = client.sync(wallet, parallel_requests).await?;
    wallet.apply_update(update)?;
    Ok(())
}

pub async fn full_scan_wallet(
    wallet: &mut Wallet,
    client: &dyn BlockchainClient,
    stop_gap: usize,
    parallel_requests: usize,
) -> Result<(), CryptoError> {
    let update = client
        .full_scan(wallet, stop_gap, parallel_requests)
        .await?;
    wallet.apply_update(update)?;
    Ok(())
}
