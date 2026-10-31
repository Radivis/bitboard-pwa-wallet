use async_trait::async_trait;
use bdk_esplora::EsploraAsyncExt;
use bdk_wallet::{Update, Wallet};
use bitcoin::{Transaction, Txid};

use crate::blockchain::BlockchainClient;
use crate::error::CryptoError;
use crate::wasm_sleep::WasmSleeper;

/// Per-request timeout for incremental sync and broadcast (seconds).
pub const ESPLORA_SYNC_HTTP_TIMEOUT_SECS: u64 = 5;
/// Per-request timeout for full scan (seconds).
///
/// A hung request fails that attempt and is not retried inside the client.
/// Internal esplora-client retries (default 6) kept a stalled `/blocks` open for
/// minutes and pinned the dev proxy when many browsers scanned at once.
/// 30s is enough for a slow public indexer response during a real history scan.
pub const ESPLORA_FULL_SCAN_HTTP_TIMEOUT_SECS: u64 = 30;
pub const ESPLORA_FULL_SCAN_MAX_TRANSPORT_RETRIES: usize = 0;

pub struct EsploraClient {
    async_client: bdk_esplora::esplora_client::AsyncClient<WasmSleeper>,
}

impl EsploraClient {
    fn new_with_timeout(
        url: &str,
        timeout_secs: u64,
        max_transport_retries: Option<usize>,
    ) -> Result<Self, CryptoError> {
        if url.is_empty() {
            return Err(CryptoError::Blockchain("URL must not be empty".to_string()));
        }
        let mut builder = bdk_esplora::esplora_client::Builder::new(url).timeout(timeout_secs);
        if let Some(max_transport_retries) = max_transport_retries {
            builder = builder.max_retries(max_transport_retries);
        }
        let async_client = builder
            .build_async_with_sleeper::<WasmSleeper>()
            .map_err(|e| CryptoError::Blockchain(e.to_string()))?;
        Ok(Self { async_client })
    }

    pub fn for_sync(url: &str) -> Result<Self, CryptoError> {
        Self::new_with_timeout(url, ESPLORA_SYNC_HTTP_TIMEOUT_SECS, None)
    }

    pub fn for_full_scan(url: &str) -> Result<Self, CryptoError> {
        Self::new_with_timeout(
            url,
            ESPLORA_FULL_SCAN_HTTP_TIMEOUT_SECS,
            Some(ESPLORA_FULL_SCAN_MAX_TRANSPORT_RETRIES),
        )
    }

    /// Default client for tests and single-shot calls (sync timeout).
    pub fn new(url: &str) -> Result<Self, CryptoError> {
        Self::for_sync(url)
    }

    /// Access the underlying esplora async client directly.
    ///
    /// Used by WASM wrappers that need to separate the request-building
    /// step (which borrows the wallet) from the async network call.
    pub fn inner(&self) -> &bdk_esplora::esplora_client::AsyncClient<WasmSleeper> {
        &self.async_client
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl BlockchainClient for EsploraClient {
    async fn full_scan(
        &self,
        wallet: &Wallet,
        stop_gap: usize,
        now: u64,
        parallel_requests: usize,
    ) -> Result<Update, CryptoError> {
        let request = wallet.start_full_scan_at(now);
        let bdk_chain_update = self
            .async_client
            .full_scan(request, stop_gap, parallel_requests)
            .await?;
        Ok(bdk_chain_update.into())
    }

    async fn sync(
        &self,
        wallet: &Wallet,
        now: u64,
        parallel_requests: usize,
    ) -> Result<Update, CryptoError> {
        let request = wallet.start_sync_with_revealed_spks_at(now);
        let bdk_chain_update = self.async_client.sync(request, parallel_requests).await?;
        Ok(bdk_chain_update.into())
    }

    async fn broadcast(&self, tx: &Transaction) -> Result<Txid, CryptoError> {
        self.async_client.broadcast(tx).await?;
        Ok(tx.compute_txid())
    }
}
