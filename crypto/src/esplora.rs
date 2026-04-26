use async_trait::async_trait;
use bdk_esplora::EsploraAsyncExt;
use bdk_wallet::{Update, Wallet};
use bitcoin::{Transaction, Txid};

use crate::blockchain::BlockchainClient;
use crate::error::CryptoError;
use crate::wasm_sleep::WasmSleeper;

/// Upper bound for each Esplora HTTP request (seconds). Keeps failed sync from hanging on stalled fetches (especially on WASM).
const ESPLORA_HTTP_TIMEOUT_SECS: u64 = 5;

pub struct EsploraClient {
    client: bdk_esplora::esplora_client::AsyncClient<WasmSleeper>,
}

impl EsploraClient {
    pub fn new(url: &str) -> Result<Self, CryptoError> {
        if url.is_empty() {
            return Err(CryptoError::Blockchain("URL must not be empty".to_string()));
        }
        let client = bdk_esplora::esplora_client::Builder::new(url)
            .timeout(ESPLORA_HTTP_TIMEOUT_SECS)
            .build_async_with_sleeper::<WasmSleeper>()
            .map_err(|e| CryptoError::Blockchain(e.to_string()))?;
        Ok(Self { client })
    }

    /// Access the underlying esplora async client directly.
    ///
    /// Used by WASM wrappers that need to separate the request-building
    /// step (which borrows the wallet) from the async network call.
    pub fn inner(&self) -> &bdk_esplora::esplora_client::AsyncClient<WasmSleeper> {
        &self.client
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
        let response = self
            .client
            .full_scan(request, stop_gap, parallel_requests)
            .await?;
        Ok(response.into())
    }

    async fn sync(
        &self,
        wallet: &Wallet,
        now: u64,
        parallel_requests: usize,
    ) -> Result<Update, CryptoError> {
        let request = wallet.start_sync_with_revealed_spks_at(now);
        let response = self.client.sync(request, parallel_requests).await?;
        Ok(response.into())
    }

    async fn broadcast(&self, tx: &Transaction) -> Result<Txid, CryptoError> {
        self.client.broadcast(tx).await?;
        Ok(tx.compute_txid())
    }
}
