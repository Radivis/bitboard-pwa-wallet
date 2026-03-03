use async_trait::async_trait;
use bdk_wallet::{Update, Wallet};
use bitcoin::{Transaction, Txid};

use crate::error::CryptoError;

/// Abstraction over blockchain data sources (e.g. Esplora).
///
/// Decouples wallet operations from the HTTP client, enabling
/// deterministic testing via `MockBlockchainClient` (generated
/// by `mockall`) or `wiremock`-backed implementations.
#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait BlockchainClient: Send + Sync {
    /// Perform a full scan of all wallet script pubkeys against the
    /// blockchain, returning an update to apply to the wallet.
    async fn full_scan(
        &self,
        wallet: &Wallet,
        stop_gap: usize,
        parallel_requests: usize,
    ) -> Result<Update, CryptoError>;

    /// Perform an incremental sync of revealed script pubkeys, known
    /// txids, and known outpoints against the blockchain.
    async fn sync(
        &self,
        wallet: &Wallet,
        parallel_requests: usize,
    ) -> Result<Update, CryptoError>;

    /// Broadcast a fully signed transaction to the network.
    async fn broadcast(&self, tx: &Transaction) -> Result<Txid, CryptoError>;
}
