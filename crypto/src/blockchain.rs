use async_trait::async_trait;
use bdk_wallet::{Update, Wallet};
use bitcoin::{Transaction, Txid};

use crate::error::CryptoError;

/// Abstraction over blockchain data sources (e.g. Esplora).
///
/// Decouples wallet operations from the HTTP client, enabling
/// deterministic testing via mock implementations or `wiremock`.
///
/// On native targets, futures must be `Send` and the trait requires
/// `Send + Sync` for thread-safe trait objects. On WASM (single-threaded),
/// these bounds are relaxed because browser APIs produce `!Send` futures.
#[cfg(not(target_arch = "wasm32"))]
#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait BlockchainClient: Send + Sync {
    async fn full_scan(
        &self,
        wallet: &Wallet,
        stop_gap: usize,
        parallel_requests: usize,
    ) -> Result<Update, CryptoError>;

    async fn sync(&self, wallet: &Wallet, parallel_requests: usize) -> Result<Update, CryptoError>;

    async fn broadcast(&self, tx: &Transaction) -> Result<Txid, CryptoError>;
}

#[cfg(target_arch = "wasm32")]
#[async_trait(?Send)]
pub trait BlockchainClient {
    async fn full_scan(
        &self,
        wallet: &Wallet,
        stop_gap: usize,
        parallel_requests: usize,
    ) -> Result<Update, CryptoError>;

    async fn sync(&self, wallet: &Wallet, parallel_requests: usize) -> Result<Update, CryptoError>;

    async fn broadcast(&self, tx: &Transaction) -> Result<Txid, CryptoError>;
}
