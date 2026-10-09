use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use ark_client::{Blockchain, SpendStatus, TxStatus};
use ark_core::ExplorerUtxo;
use bitcoin::{Address, OutPoint, Transaction, Txid};

use crate::constants::{
    ESPLORA_FEE_ESTIMATE_BLOCK_TARGET, MIN_FEE_RATE_SAT_PER_VB, UNSPENT_OUTSPEND_CACHE_TTL_MS,
};
use crate::error::{ArkResult, ArkWasmError};
use crate::outpoint::OnchainOutPoint;

/// Per-request timeout. WASM `Failed to fetch` is often a hung Mutinynet Esplora GET;
/// 5s was too tight for 70-step confirmation walks (one slow `/tx/status` aborted the scan).
const ESPLORA_HTTP_TIMEOUT_SECS: u64 = 15;

/// Mempool's `/txs/package` handler calls `parseFloat(req.query.maxfeerate)` and forwards the
/// value to bitcoind. When query params are omitted that becomes `NaN`, which makes
/// `submitpackage` fail with a generic RPC error. Always send explicit limits (0 = accept any).
const SUBMIT_PACKAGE_MAX_FEE_RATE_BTC_PER_KVB: f64 = 0.0;
/// Same as [`SUBMIT_PACKAGE_MAX_FEE_RATE_BTC_PER_KVB`]: `0` means accept any burn amount.
const SUBMIT_PACKAGE_MAX_BURN_AMOUNT_BTC: f64 = 0.0;

/// Confirmation and `/raw` relay results for the current chain tip.
/// Positive confirmations stay until the tip changes. Zero confirmations and
/// "not relayed" expire after [`UNSPENT_OUTSPEND_CACHE_TTL_MS`].
#[derive(Default)]
struct ConfirmationCache {
    scan_prepared: bool,
    tip_height: Option<u32>,
    confirmed_at_tip: HashMap<Txid, u64>,
    /// When an absent tx was last proven to have 0 confirmations.
    absent_fetched_at_ms: HashMap<Txid, u64>,
    /// `/raw` presence. `true` lasts until the tip changes; `false` uses the absent TTL.
    relayed_on_network: HashMap<Txid, bool>,
}

/// True while an absent-tx probe is still inside the outspend cache window.
fn absent_tx_probe_still_fresh(fetched_at_ms: u64, now_ms: u64) -> bool {
    now_ms.saturating_sub(fetched_at_ms) < UNSPENT_OUTSPEND_CACHE_TTL_MS
}

/// One `/tx/{txid}/outspends` response: spending txid per output, plus when it was fetched.
struct CachedOutspends {
    spend_txids: Vec<Option<Txid>>,
    fetched_at_ms: u64,
}

/// Outspend responses keyed by the transaction that created the outputs.
#[derive(Default)]
struct OutspendCache {
    by_txid: HashMap<Txid, CachedOutspends>,
}

/// Milliseconds since the Unix epoch, used only for cache TTLs.
fn now_ms() -> u64 {
    #[cfg(target_arch = "wasm32")]
    {
        js_sys::Date::now() as u64
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0)
    }
}

/// Esplora async client. On WASM the sleeper yields to the browser event loop between retries.
#[cfg(target_arch = "wasm32")]
type EsploraAsyncClient = esplora_client::AsyncClient<crate::wasm_sleep::WasmSleeper>;
/// Esplora async client on native targets.
#[cfg(not(target_arch = "wasm32"))]
type EsploraAsyncClient = esplora_client::AsyncClient;

/// Esplora-backed [`Blockchain`] with confirmation and outspend caches.
pub struct EsploraBlockchain {
    client: Arc<EsploraAsyncClient>,
    confirmation_cache: Mutex<ConfirmationCache>,
    outspend_cache: Arc<Mutex<OutspendCache>>,
}

impl EsploraBlockchain {
    /// Client for `esplora_url`. An empty URL is rejected. Each request times out after
    /// [`ESPLORA_HTTP_TIMEOUT_SECS`] and sends cache-busting headers.
    pub fn new(esplora_url: &str) -> ArkResult<Self> {
        if esplora_url.is_empty() {
            return Err(ArkWasmError::EmptyEsploraUrl);
        }

        #[cfg(target_arch = "wasm32")]
        let client = {
            use crate::wasm_sleep::WasmSleeper;
            esplora_client::Builder::new(esplora_url)
                .timeout(ESPLORA_HTTP_TIMEOUT_SECS)
                .header("Cache-Control", "no-cache")
                .header("Pragma", "no-cache")
                .build_async_with_sleeper::<WasmSleeper>()
                .map_err(|error| ArkWasmError::Blockchain(error.to_string()))?
        };

        #[cfg(not(target_arch = "wasm32"))]
        let client = esplora_client::Builder::new(esplora_url)
            .timeout(ESPLORA_HTTP_TIMEOUT_SECS)
            .header("Cache-Control", "no-cache")
            .header("Pragma", "no-cache")
            .build_async_with_sleeper()
            .map_err(|error| ArkWasmError::Blockchain(error.to_string()))?;

        Ok(Self {
            client: Arc::new(client),
            confirmation_cache: Mutex::new(ConfirmationCache::default()),
            outspend_cache: Arc::new(Mutex::new(OutspendCache::default())),
        })
    }

    /// Turn an Esplora client error into Ark's wallet error.
    fn map_esplora_error(error: esplora_client::Error) -> ark_client::Error {
        ark_client::Error::wallet(error.to_string())
    }

    /// Unspent outputs for `address`, with confirmation depth filled in.
    async fn find_outpoints_at(
        client: &EsploraAsyncClient,
        address: &Address,
    ) -> Result<Vec<ExplorerUtxo>, ark_client::Error> {
        collect_address_utxos(client, address).await
    }

    /// Transaction bytes from `/tx/{txid}/raw`. When `/raw` is missing, fall back to JSON
    /// `/tx/{txid}`. arkade-regtest serves commitment transactions that way.
    async fn find_tx_at(
        client: &EsploraAsyncClient,
        txid: &Txid,
    ) -> Result<Option<Transaction>, ark_client::Error> {
        if let Some(tx) = client
            .get_tx(txid)
            .await
            .map_err(EsploraBlockchain::map_esplora_error)?
        {
            return Ok(Some(tx));
        }

        // arkade-regtest's mempool Esplora serves `/tx/{txid}` JSON but not `/tx/{txid}/raw`
        // (404). Fall back to the JSON endpoint so commitment txs remain loadable for unilateral
        // exit on regtest.
        Ok(client
            .get_tx_info(txid)
            .await
            .map_err(EsploraBlockchain::map_esplora_error)?
            .map(|tx_info| tx_info.to_tx()))
    }

    /// Ark [`TxStatus`]: the block time when the transaction is confirmed.
    async fn get_tx_status_at(
        client: &EsploraAsyncClient,
        txid: &Txid,
    ) -> Result<TxStatus, ark_client::Error> {
        map_tx_status(client, txid).await
    }

    /// Confirmation depth for `txid`. Confirmed results stay cached until the tip changes.
    /// A miss (zero confirmations) is reused only for [`UNSPENT_OUTSPEND_CACHE_TTL_MS`].
    pub async fn get_tx_confirmations(&self, txid: &Txid) -> ArkResult<u64> {
        if !self.confirmation_scan_is_prepared() {
            self.prepare_confirmation_scan().await;
        }
        if let Some(confirmations) = self.cached_confirmations(txid) {
            return Ok(confirmations);
        }
        let client = Arc::clone(&self.client);
        let txid = *txid;
        let tip_height = self.cached_tip_height();
        let relay_status = map_tx_confirmations(&client, &txid, tip_height)
            .await
            .map_err(|error| ArkWasmError::Blockchain(error.to_string()))?;
        let confirmations = relay_status.confirmations;
        self.store_tx_probe(txid, relay_status);
        Ok(confirmations)
    }

    /// Snapshot chain tip once so a progress/proceed walk does not refetch `/blocks/tip/height`
    /// per tx. Confirmed results stay cached until the tip changes.
    pub async fn prepare_confirmation_scan(&self) {
        let tip_height = self.client.get_height().await.ok();
        let mut cache = self
            .confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if cache.tip_height != tip_height {
            cache.confirmed_at_tip.clear();
            cache.absent_fetched_at_ms.clear();
            cache.relayed_on_network.clear();
            cache.tip_height = tip_height;
        }
        cache.scan_prepared = true;
    }

    /// Chain tip height captured by [`Self::prepare_confirmation_scan`], if that call succeeded.
    pub fn cached_tip_height(&self) -> Option<u32> {
        self.confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .tip_height
    }

    /// Whether [`Self::prepare_confirmation_scan`] has run since this client was created.
    fn confirmation_scan_is_prepared(&self) -> bool {
        self.confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .scan_prepared
    }

    /// Cached confirmation depth. `Some(0)` is returned only while the absent-probe TTL holds.
    fn cached_confirmations(&self, txid: &Txid) -> Option<u64> {
        let cache = self
            .confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(confirmations) = cache.confirmed_at_tip.get(txid).copied() {
            return Some(confirmations);
        }
        let fetched_at_ms = cache.absent_fetched_at_ms.get(txid).copied()?;
        if absent_tx_probe_still_fresh(fetched_at_ms, now_ms()) {
            Some(0)
        } else {
            None
        }
    }

    /// Cached `/raw` presence. `Some(true)` lasts until the tip changes. `Some(false)` expires
    /// with the absent-probe TTL.
    fn cached_relayed(&self, txid: &Txid) -> Option<bool> {
        let cache = self
            .confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match cache.relayed_on_network.get(txid).copied() {
            Some(true) => Some(true),
            Some(false) => {
                let fetched_at_ms = cache.absent_fetched_at_ms.get(txid).copied()?;
                if absent_tx_probe_still_fresh(fetched_at_ms, now_ms()) {
                    Some(false)
                } else {
                    None
                }
            }
            None => None,
        }
    }

    /// Remember a probe. Positive confirmations also mark the tx relayed until the tip changes.
    /// Zero confirmations are stored as an absent-probe entry.
    fn store_tx_probe(&self, txid: Txid, relay_status: TxRelayStatus) {
        let mut cache = self
            .confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        cache
            .relayed_on_network
            .insert(txid, relay_status.relayed_on_network);
        if relay_status.confirmations > 0 {
            cache
                .confirmed_at_tip
                .insert(txid, relay_status.confirmations);
            cache.absent_fetched_at_ms.remove(&txid);
        } else {
            cache.confirmed_at_tip.remove(&txid);
            cache.absent_fetched_at_ms.insert(txid, now_ms());
        }
    }

    /// Drop a cached absent/relay result so the post-broadcast visibility check hits Esplora once.
    pub(crate) fn forget_tx_probe(&self, txid: &Txid) {
        let mut cache = self
            .confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        cache.confirmed_at_tip.remove(txid);
        cache.absent_fetched_at_ms.remove(txid);
        cache.relayed_on_network.remove(txid);
    }

    /// Record a step that this scan already counted as confirmed, or cache a zero-conf miss.
    /// A positive count also marks the transaction relayed.
    pub(crate) fn store_confirmed_at_tip(&self, txid: Txid, confirmations: u64) {
        let mut cache = self
            .confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if confirmations > 0 {
            cache.confirmed_at_tip.insert(txid, confirmations);
            cache.absent_fetched_at_ms.remove(&txid);
            cache.relayed_on_network.insert(txid, true);
        } else {
            cache.confirmed_at_tip.remove(&txid);
            cache.absent_fetched_at_ms.insert(txid, now_ms());
        }
    }

    /// True when `/tx/{txid}/raw` returns a transaction (mempool or chain).
    ///
    /// Unlike [`Self::find_tx_at`], this does not fall back to JSON-only `/tx/{txid}` entries that
    /// arkade-regtest serves for virtual-tree artifacts before they are relayed.
    ///
    /// See `docs/arkade-regtest-esplora-quirks.md` — use for **broadcast gating only**, not step completion.
    pub async fn is_tx_relayed_on_network(&self, txid: &Txid) -> ArkResult<bool> {
        if let Some(relayed) = self.cached_relayed(txid) {
            return Ok(relayed);
        }
        let client = Arc::clone(&self.client);
        let txid = *txid;
        let relayed = client
            .get_tx(&txid)
            .await
            .map_err(EsploraBlockchain::map_esplora_error)?
            .is_some();
        if relayed {
            let mut cache = self
                .confirmation_cache
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            cache.relayed_on_network.insert(txid, true);
        } else {
            self.store_tx_probe(
                txid,
                TxRelayStatus {
                    confirmations: 0,
                    relayed_on_network: false,
                },
            );
        }
        Ok(relayed)
    }

    /// Spend status of one output. Spent outputs stay cached. Unspent results expire after
    /// [`UNSPENT_OUTSPEND_CACHE_TTL_MS`].
    async fn get_output_status_at(
        client: &EsploraAsyncClient,
        outspend_cache: &Mutex<OutspendCache>,
        txid: &Txid,
        vout: u32,
    ) -> Result<SpendStatus, ark_client::Error> {
        if let Some(status) = cached_spend_status(outspend_cache, txid, vout) {
            return Ok(status);
        }
        let spend_txids = fetch_and_store_outspends(client, outspend_cache, txid).await?;
        Ok(SpendStatus {
            spend_txid: spend_txids.get(vout as usize).copied().flatten(),
        })
    }

    /// Broadcast one transaction with Esplora `POST /tx`.
    async fn broadcast_at(
        client: &EsploraAsyncClient,
        tx: &Transaction,
    ) -> Result<(), ark_client::Error> {
        client
            .broadcast(tx)
            .await
            .map_err(EsploraBlockchain::map_esplora_error)?;
        Ok(())
    }

    /// Fee rate in sat/vB from [`map_fee_rate`].
    async fn get_fee_rate_at(client: &EsploraAsyncClient) -> Result<f64, ark_client::Error> {
        map_fee_rate(client).await
    }

    /// Broadcast a CPFP package via `/txs/package`. A mempool that answers with a
    /// `submitpackage` RPC error is retried by broadcasting each transaction in order.
    /// A missing `/txs/package` endpoint is an error: unilateral exit needs package relay
    /// so the fee-paying child can carry a zero-fee parent.
    async fn broadcast_package_at(
        client: &EsploraAsyncClient,
        txs: &[&Transaction],
    ) -> Result<(), ark_client::Error> {
        let owned_transactions: Vec<Transaction> = txs.iter().map(|tx| (*tx).clone()).collect();
        let package_result = match client
            .submit_package(
                &owned_transactions,
                Some(SUBMIT_PACKAGE_MAX_FEE_RATE_BTC_PER_KVB),
                Some(SUBMIT_PACKAGE_MAX_BURN_AMOUNT_BTC),
            )
            .await
        {
            Ok(result) => result,
            Err(esplora_client::Error::HttpResponse { status: 404, .. }) => {
                return Err(ark_client::Error::wallet(
                    "Esplora does not support transaction package broadcast (/txs/package). \
                     Unilateral exit unroll requires CPFP package relay so the fee-bumping child \
                     can pay for the zero-fee parent transaction."
                        .to_string(),
                ));
            }
            Err(esplora_client::Error::HttpResponse {
                status: 400,
                ref message,
            }) if is_mempool_submitpackage_rpc_error(message) => {
                return Self::broadcast_transactions_sequentially(client, txs).await;
            }
            Err(error) => {
                return Err(EsploraBlockchain::map_esplora_error(error));
            }
        };
        validate_submit_package_result(&package_result)?;
        Ok(())
    }

    /// Broadcast `txs` one by one. An "already in mempool" error on a transaction is skipped.
    async fn broadcast_transactions_sequentially(
        client: &EsploraAsyncClient,
        txs: &[&Transaction],
    ) -> Result<(), ark_client::Error> {
        for tx in txs {
            if let Err(error) = client.broadcast(tx).await {
                if is_transaction_already_relayed_error(&error) {
                    continue;
                }
                return Err(EsploraBlockchain::map_esplora_error(error));
            }
        }
        Ok(())
    }
}

/// [`Blockchain`] for native targets requires `Send` futures. WASM futures are not `Send`,
/// so that bound is applied only outside `wasm32`.
macro_rules! impl_esplora_blockchain {
    ($($send_bound:tt)*) => {
        impl Blockchain for EsploraBlockchain {
            /// Unspent outputs for `address`. See [`EsploraBlockchain::find_outpoints_at`].
            fn find_outpoints(
                &self,
                address: &Address,
            ) -> impl std::future::Future<
                Output = Result<Vec<ExplorerUtxo>, ark_client::Error>,
            > $($send_bound)*
            {
                let client = Arc::clone(&self.client);
                let address = address.clone();
                async move { EsploraBlockchain::find_outpoints_at(&client, &address).await }
            }

            /// Transaction bytes for `txid`. See [`EsploraBlockchain::find_tx_at`].
            fn find_tx(
                &self,
                txid: &Txid,
            ) -> impl std::future::Future<
                Output = Result<Option<Transaction>, ark_client::Error>,
            > $($send_bound)*
            {
                let client = Arc::clone(&self.client);
                let txid = *txid;
                async move { EsploraBlockchain::find_tx_at(&client, &txid).await }
            }

            /// Confirmation time for `txid`. See [`EsploraBlockchain::get_tx_status_at`].
            fn get_tx_status(
                &self,
                txid: &Txid,
            ) -> impl std::future::Future<Output = Result<TxStatus, ark_client::Error>> $($send_bound)*
            {
                let client = Arc::clone(&self.client);
                let txid = *txid;
                async move { EsploraBlockchain::get_tx_status_at(&client, &txid).await }
            }

            /// Spend status of output `vout`. See [`EsploraBlockchain::get_output_status_at`].
            fn get_output_status(
                &self,
                txid: &Txid,
                vout: u32,
            ) -> impl std::future::Future<Output = Result<SpendStatus, ark_client::Error>> $($send_bound)*
            {
                let client = Arc::clone(&self.client);
                let outspend_cache = Arc::clone(&self.outspend_cache);
                let txid = *txid;
                async move {
                    EsploraBlockchain::get_output_status_at(&client, &outspend_cache, &txid, vout)
                        .await
                }
            }

            /// Broadcast one transaction. See [`EsploraBlockchain::broadcast_at`].
            fn broadcast(
                &self,
                tx: &Transaction,
            ) -> impl std::future::Future<Output = Result<(), ark_client::Error>> $($send_bound)*
            {
                let client = Arc::clone(&self.client);
                let tx = tx.clone();
                async move { EsploraBlockchain::broadcast_at(&client, &tx).await }
            }

            /// Fee rate in sat/vB. See [`EsploraBlockchain::get_fee_rate_at`].
            fn get_fee_rate(
                &self,
            ) -> impl std::future::Future<Output = Result<f64, ark_client::Error>> $($send_bound)*
            {
                let client = Arc::clone(&self.client);
                async move { EsploraBlockchain::get_fee_rate_at(&client).await }
            }

            /// Broadcast a CPFP package. See [`EsploraBlockchain::broadcast_package_at`].
            fn broadcast_package(
                &self,
                txs: &[&Transaction],
            ) -> impl std::future::Future<Output = Result<(), ark_client::Error>> $($send_bound)*
            {
                let client = Arc::clone(&self.client);
                let txs: Vec<Transaction> = txs.iter().map(|tx| (*tx).clone()).collect();
                async move {
                    EsploraBlockchain::broadcast_package_at(
                        &client,
                        &txs.iter().collect::<Vec<_>>(),
                    )
                    .await
                }
            }
        }
    };
}

#[cfg(not(target_arch = "wasm32"))]
impl_esplora_blockchain!(+ Send);

#[cfg(target_arch = "wasm32")]
impl_esplora_blockchain!();

/// Confirmation depth of an address UTXO. Unconfirmed outputs are 0. When both the block
/// height and the chain tip are known, depth is `tip - block + 1`. A confirmed output that
/// is missing either height counts as 1.
fn utxo_confirmations(status: &esplora_client::UtxoStatus, chain_tip_height: Option<u32>) -> u64 {
    if !status.confirmed {
        return 0;
    }
    match (status.block_height, chain_tip_height) {
        (Some(block_height), Some(tip_height)) => {
            u64::from(tip_height.saturating_sub(block_height) + 1)
        }
        _ => 1,
    }
}

/// Address UTXOs from Esplora. When a confirmed UTXO omits its block time, that time is
/// filled from `/tx/{txid}/status`.
async fn collect_address_utxos(
    client: &EsploraAsyncClient,
    address: &Address,
) -> Result<Vec<ExplorerUtxo>, ark_client::Error> {
    let utxos = client
        .get_address_utxos(address)
        .await
        .map_err(EsploraBlockchain::map_esplora_error)?;

    let chain_tip_height = client
        .get_height()
        .await
        .map_err(EsploraBlockchain::map_esplora_error)
        .ok();

    let mut explorer_utxos = Vec::with_capacity(utxos.len());
    for utxo in utxos {
        let outpoint = OnchainOutPoint::from_bitcoin_outpoint(OutPoint {
            txid: utxo.txid,
            vout: utxo.vout,
        })
        .inner();
        let mut confirmation_blocktime = utxo.status.block_time;
        if utxo.status.confirmed && confirmation_blocktime.is_none() {
            let tx_status = client
                .get_tx_status(&utxo.txid)
                .await
                .map_err(EsploraBlockchain::map_esplora_error)?;
            confirmation_blocktime = tx_status.block_time;
        }
        let confirmations = utxo_confirmations(&utxo.status, chain_tip_height);
        explorer_utxos.push(ExplorerUtxo {
            outpoint,
            amount: utxo.value,
            confirmation_blocktime,
            confirmations,
            is_spent: false,
        });
    }
    Ok(explorer_utxos)
}

/// `/tx/{txid}/status`. A 404 falls back to the status embedded in JSON `/tx/{txid}`.
async fn esplora_tx_status(
    client: &EsploraAsyncClient,
    txid: &Txid,
) -> Result<Option<esplora_client::api::TxStatus>, ark_client::Error> {
    match client.get_tx_status(txid).await {
        Ok(status) => Ok(Some(status)),
        Err(esplora_client::Error::HttpResponse { status: 404, .. }) => client
            .get_tx_info(txid)
            .await
            .map_err(EsploraBlockchain::map_esplora_error)
            .map(|tx_info| tx_info.map(|tx| tx.status)),
        Err(error) => Err(EsploraBlockchain::map_esplora_error(error)),
    }
}

/// Confirmation depth from a JSON tx status. Unconfirmed is 0.
fn confirmations_from_esplora_tx_status(
    status: &esplora_client::api::TxStatus,
    chain_tip_height: Option<u32>,
) -> u64 {
    if !status.confirmed {
        return 0;
    }
    mined_tx_confirmations(status.block_height, chain_tip_height)
}

/// `tip - block_height + 1` when both heights are known and the tip is not behind the block.
/// A missing height or a missing tip is 0, so a probe cannot invent a confirmation.
fn mined_tx_confirmations(block_height: Option<u32>, chain_tip_height: Option<u32>) -> u64 {
    match (block_height, chain_tip_height) {
        (Some(block_height), Some(tip_height)) if tip_height >= block_height => {
            u64::from(tip_height - block_height + 1)
        }
        (Some(_), Some(_)) => 0,
        // Missing tip used to mint fake 1-conf. Fail closed: not confirmed.
        (Some(_), None) => 0,
        (None, _) => 0,
    }
}

/// `/status.confirmed` is not 1-conf by itself. arkade-regtest proxies `/status` to mempool when
/// bitcoind has not confirmed the tx; those virtual-tree stubs can claim `confirmed: true` while
/// `GET /tx/{txid}/raw` is 404. Skipping an unpublished unroll step as complete rewinds to
/// "step 2" after lock (WASM confirmation cache gone) and makes the next `submitpackage` fail
/// with `package-not-child-with-unconfirmed-parents`.
///
/// `None` means `/status` did not report confirmed — caller may consult relay + JSON.
fn confirmations_if_status_confirmed_on_network(
    status_confirmed: bool,
    block_height: Option<u32>,
    chain_tip_height: Option<u32>,
    raw_relayed: bool,
) -> Option<u64> {
    if !status_confirmed {
        return None;
    }
    if !raw_relayed {
        return Some(0);
    }
    Some(mined_tx_confirmations(block_height, chain_tip_height))
}

/// True when the Esplora error text says the transaction is in neither mempool nor chain.
#[cfg(test)]
fn is_missing_tx_esplora_error(error: &esplora_client::Error) -> bool {
    match error {
        esplora_client::Error::HttpResponse { message, .. } => {
            let lowered = message.to_ascii_lowercase();
            lowered.contains("no such mempool or blockchain transaction")
        }
        _ => false,
    }
}

/// Confirmation depth together with whether Esplora served the raw transaction.
///
/// `relayed_on_network` is whether `GET /tx/{txid}/raw` returned the transaction, in the
/// mempool or in a block. It is `false` when `/raw` is absent, including HTTP 404.
/// A transaction present on `/raw` with no JSON status has `confirmations == 0` and
/// `relayed_on_network == true`: it is on the network, and its confirmation depth is
/// still unknown.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct TxRelayStatus {
    confirmations: u64,
    relayed_on_network: bool,
}

/// When `/status` is missing or still reports unconfirmed, consult relay + JSON status.
/// Virtual-tree indexes can serve `confirmed: false` from `/status` even after a mined broadcast.
async fn confirmations_for_relayed_tx(
    client: &EsploraAsyncClient,
    txid: &Txid,
    chain_tip_height: Option<u32>,
) -> Result<TxRelayStatus, ark_client::Error> {
    let relayed_on_network = client
        .get_tx(txid)
        .await
        .map_err(EsploraBlockchain::map_esplora_error)?
        .is_some();
    if !relayed_on_network {
        return Ok(TxRelayStatus {
            confirmations: 0,
            relayed_on_network: false,
        });
    }
    let Some(tx_info) = client
        .get_tx_info(txid)
        .await
        .map_err(EsploraBlockchain::map_esplora_error)?
    else {
        return Ok(TxRelayStatus {
            confirmations: 0,
            relayed_on_network: true,
        });
    };
    Ok(TxRelayStatus {
        confirmations: confirmations_from_esplora_tx_status(&tx_info.status, chain_tip_height),
        relayed_on_network: true,
    })
}

/// Ark [`TxStatus::confirmed_at`] from the Esplora status block time.
async fn map_tx_status(
    client: &EsploraAsyncClient,
    txid: &Txid,
) -> Result<TxStatus, ark_client::Error> {
    let status = esplora_tx_status(client, txid).await?;
    Ok(TxStatus {
        confirmed_at: status.and_then(|status| status.block_time.map(|time| time as i64)),
    })
}

/// Confirmation depth and [`TxRelayStatus::relayed_on_network`] for one transaction.
async fn map_tx_confirmations(
    client: &EsploraAsyncClient,
    txid: &Txid,
    chain_tip_height: Option<u32>,
) -> Result<TxRelayStatus, ark_client::Error> {
    let status = match client.get_tx_status(txid).await {
        Ok(status) => Some(status),
        Err(esplora_client::Error::HttpResponse { status: 404, .. }) => None,
        Err(error) => return Err(EsploraBlockchain::map_esplora_error(error)),
    };

    if let Some(status) = status.filter(|status| status.confirmed) {
        let raw_relayed = client
            .get_tx(txid)
            .await
            .map_err(EsploraBlockchain::map_esplora_error)?
            .is_some();
        return Ok(TxRelayStatus {
            confirmations: confirmations_if_status_confirmed_on_network(
                true,
                status.block_height,
                chain_tip_height,
                raw_relayed,
            )
            .unwrap_or(0),
            relayed_on_network: raw_relayed,
        });
    }

    confirmations_for_relayed_tx(client, txid, chain_tip_height).await
}

/// Cached spend status. A known spending txid stays cached. An unspent result expires after
/// [`UNSPENT_OUTSPEND_CACHE_TTL_MS`].
fn cached_spend_status(
    cache: &Mutex<OutspendCache>,
    txid: &Txid,
    vout: u32,
) -> Option<SpendStatus> {
    let cache = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let entry = cache.by_txid.get(txid)?;
    let spend_txid = entry.spend_txids.get(vout as usize).copied().flatten();
    if spend_txid.is_some() {
        return Some(SpendStatus { spend_txid });
    }
    let age_ms = now_ms().saturating_sub(entry.fetched_at_ms);
    if age_ms < UNSPENT_OUTSPEND_CACHE_TTL_MS {
        return Some(SpendStatus { spend_txid: None });
    }
    None
}

/// Store one `/outspends` response, stamped with the current time.
fn store_outspends(cache: &Mutex<OutspendCache>, txid: Txid, spend_txids: Vec<Option<Txid>>) {
    let mut cache = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    cache.by_txid.insert(
        txid,
        CachedOutspends {
            spend_txids,
            fetched_at_ms: now_ms(),
        },
    );
}

/// Load `/tx/{txid}/outspends` and store the result.
async fn fetch_and_store_outspends(
    client: &EsploraAsyncClient,
    cache: &Mutex<OutspendCache>,
    txid: &Txid,
) -> Result<Vec<Option<Txid>>, ark_client::Error> {
    let spend_txids = load_tx_outspend_txids(client, txid).await?;
    store_outspends(cache, *txid, spend_txids.clone());
    Ok(spend_txids)
}

/// Spending txids from `/tx/{txid}/outspends`, in output order. A non-probeable error
/// yields an empty list, which callers treat as unspent.
async fn load_tx_outspend_txids(
    client: &EsploraAsyncClient,
    txid: &Txid,
) -> Result<Vec<Option<Txid>>, ark_client::Error> {
    let outspends = match client.get_tx_outspends(txid).await {
        Ok(outspends) => outspends,
        Err(error) if is_non_probeable_outspend_error(&error) => {
            return Ok(Vec::new());
        }
        Err(error) => return Err(EsploraBlockchain::map_esplora_error(error)),
    };
    Ok(outspends
        .iter()
        .map(|output| output.txid)
        .collect::<Vec<_>>())
}

/// Virtual-tree txs and other off-chain artifacts may exist as JSON `/tx/{txid}` stubs while
/// `/tx/{txid}/outspends` returns 404/500 on arkade-regtest. Treat as "spend unknown / unspent".
fn is_non_probeable_outspend_error(error: &esplora_client::Error) -> bool {
    match error {
        esplora_client::Error::HttpResponse { status: 404, .. } => true,
        esplora_client::Error::HttpResponse {
            status: 500,
            message,
            ..
        } => {
            message.contains("outspends") || message.contains("Failed to get transaction outspends")
        }
        _ => false,
    }
}

/// Sat/vB for [`ESPLORA_FEE_ESTIMATE_BLOCK_TARGET`], or the lowest published estimate.
/// A failed `/fee-estimates` request returns [`MIN_FEE_RATE_SAT_PER_VB`].
async fn map_fee_rate(client: &EsploraAsyncClient) -> Result<f64, ark_client::Error> {
    let estimates = match client.get_fee_estimates().await {
        Ok(estimates) => estimates,
        Err(_) => {
            // arkade-regtest's mempool Esplora does not implement `/fee-estimates` (404).
            return Ok(MIN_FEE_RATE_SAT_PER_VB);
        }
    };
    let fee_rate = estimates
        .get(&ESPLORA_FEE_ESTIMATE_BLOCK_TARGET)
        .copied()
        .or_else(|| estimates.values().copied().reduce(f64::min))
        .unwrap_or(MIN_FEE_RATE_SAT_PER_VB);
    Ok(fee_rate.max(MIN_FEE_RATE_SAT_PER_VB))
}

/// Mempool Esplora answered `submitpackage` with an RPC error instead of a package result.
fn is_mempool_submitpackage_rpc_error(message: &str) -> bool {
    message.contains("submitpackage RPC error")
}

/// Broadcast failed because the transaction is already in the mempool or already known.
fn is_transaction_already_relayed_error(error: &esplora_client::Error) -> bool {
    match error {
        esplora_client::Error::HttpResponse { message, .. } => {
            is_already_relayed_broadcast_error_message(message)
        }
        _ => false,
    }
}

/// True when `error` means the unilateral-exit transaction was already relayed.
pub(crate) fn is_redundant_unilateral_exit_broadcast_error(error: &ark_client::Error) -> bool {
    is_already_relayed_broadcast_error_message(&error.to_string())
}

/// `submitpackage` rejected a parent that GET `/tx/status` may already show as confirmed.
/// Frontend maps this to `waitingForParentData`. See `docs/unilateral-exit.md`.
pub(crate) fn is_package_not_child_with_unconfirmed_parents_error(
    error: &ark_client::Error,
) -> bool {
    is_package_not_child_with_unconfirmed_parents_message(&error.to_string())
}

/// True when `message` is bitcoind's `package-not-child-with-unconfirmed-parents`.
fn is_package_not_child_with_unconfirmed_parents_message(message: &str) -> bool {
    message
        .to_ascii_lowercase()
        .contains("package-not-child-with-unconfirmed-parents")
}

/// True when a broadcast error means the node already has the transaction.
/// Includes mempool wording and bitcoind RPC code `-25` (`txn-already-in-mempool` /
/// `txn-already-known`).
fn is_already_relayed_broadcast_error_message(message: &str) -> bool {
    let lowered = message.to_ascii_lowercase();
    lowered.contains("already in mempool")
        || lowered.contains("txn-already-in-mempool")
        || lowered.contains("txn-already-known")
        || lowered.contains("already known")
        || lowered.contains("code\":-25")
        || lowered.contains("code\": -25")
        || lowered.contains("\"code\":-25")
        || lowered.contains("\"code\": -25")
        || (lowered.contains("sendrawtransaction") && lowered.contains("-25"))
}

/// Accept a package result only when `package_msg` is `success` and no transaction has an error.
fn validate_submit_package_result(
    package_result: &esplora_client::SubmitPackageResult,
) -> Result<(), ark_client::Error> {
    let rejected_transactions: Vec<String> = package_result
        .tx_results
        .values()
        .filter_map(|tx_result| {
            tx_result
                .error
                .as_ref()
                .map(|error| format!("{}: {error}", tx_result.txid))
        })
        .collect();

    if !rejected_transactions.is_empty() {
        return Err(ark_client::Error::wallet(rejected_transactions.join("; ")));
    }

    if package_result.package_msg != "success" {
        return Err(ark_client::Error::wallet(format!(
            "transaction package not accepted: {}",
            package_result.package_msg
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use esplora_client::UtxoStatus;

    use bitcoin::hashes::Hash;
    use bitcoin::hashes::sha256d::Hash as Sha256dHash;
    use bitcoin::{Txid, Wtxid};
    use esplora_client::{SubmitPackageResult, TxResult};
    use std::collections::HashMap;

    use super::absent_tx_probe_still_fresh;
    use super::confirmations_if_status_confirmed_on_network;
    use super::is_mempool_submitpackage_rpc_error;
    use super::is_missing_tx_esplora_error;
    use super::is_package_not_child_with_unconfirmed_parents_message;
    use super::is_transaction_already_relayed_error;
    use super::mined_tx_confirmations;
    use super::utxo_confirmations;
    use super::validate_submit_package_result;
    use crate::constants::UNSPENT_OUTSPEND_CACHE_TTL_MS;

    #[test]
    fn absent_tx_probe_stays_fresh_inside_the_outspend_ttl() {
        assert!(absent_tx_probe_still_fresh(1_000, 1_000));
        assert!(absent_tx_probe_still_fresh(
            1_000,
            1_000 + UNSPENT_OUTSPEND_CACHE_TTL_MS - 1
        ));
        assert!(!absent_tx_probe_still_fresh(
            1_000,
            1_000 + UNSPENT_OUTSPEND_CACHE_TTL_MS
        ));
    }

    #[test]
    fn mempool_submitpackage_rpc_error_is_detected() {
        assert!(is_mempool_submitpackage_rpc_error(
            r#"{"error":"submitpackage RPC error: {\"code\":-1}"}"#
        ));
        assert!(!is_mempool_submitpackage_rpc_error("min relay fee not met"));
    }

    #[test]
    fn already_relayed_broadcast_errors_are_treated_as_success() {
        let error = esplora_client::Error::HttpResponse {
            status: 400,
            message: "sendrawtransaction RPC error: txn-already-in-mempool".to_string(),
        };
        assert!(is_transaction_already_relayed_error(&error));
    }

    #[test]
    fn missing_tx_esplora_error_is_detected() {
        let error = esplora_client::Error::HttpResponse {
            status: 500,
            message: r#"{"error":"No such mempool or blockchain transaction. Use gettransaction for wallet transactions."}"#
                .to_string(),
        };
        assert!(is_missing_tx_esplora_error(&error));
    }

    #[test]
    fn rpc_minus_25_broadcast_error_is_treated_as_already_relayed() {
        let error = esplora_client::Error::HttpResponse {
            status: 400,
            message: r#"{"error":"sendrawtransaction RPC error: {\"code\":-25}"}"#.to_string(),
        };
        assert!(is_transaction_already_relayed_error(&error));
    }

    #[test]
    fn submit_package_result_accepts_success_without_tx_errors() {
        let package_result = SubmitPackageResult {
            package_msg: "success".to_string(),
            tx_results: HashMap::new(),
            replaced_transactions: None,
        };
        assert!(validate_submit_package_result(&package_result).is_ok());
    }

    #[test]
    fn submit_package_result_rejects_transactions_with_mempool_errors() {
        let txid = Txid::from_byte_array([0xab; 32]);
        let mut tx_results = HashMap::new();
        tx_results.insert(
            Wtxid::from(Sha256dHash::from_byte_array([0xab; 32])),
            TxResult {
                txid,
                other_wtxid: None,
                vsize: None,
                fees: None,
                error: Some("min relay fee not met, 0 < 13".to_string()),
            },
        );
        let package_result = SubmitPackageResult {
            package_msg: "success".to_string(),
            tx_results,
            replaced_transactions: None,
        };
        let error = validate_submit_package_result(&package_result)
            .expect_err("expected package validation to fail");
        assert!(
            error.to_string().contains("min relay fee not met"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn confirmations_use_chain_tip_not_block_height() {
        let status = UtxoStatus {
            confirmed: true,
            block_height: Some(100),
            block_hash: None,
            block_time: Some(1_700_000_000),
        };
        assert_eq!(utxo_confirmations(&status, Some(109)), 10);
        assert_ne!(utxo_confirmations(&status, Some(109)), 101);
    }

    #[test]
    fn unconfirmed_utxo_has_zero_confirmations() {
        let status = UtxoStatus {
            confirmed: false,
            block_height: None,
            block_hash: None,
            block_time: None,
        };
        assert_eq!(utxo_confirmations(&status, Some(500)), 0);
    }

    #[test]
    fn mined_tx_without_block_height_is_not_treated_as_confirmed() {
        assert_eq!(mined_tx_confirmations(None, Some(100)), 0);
        assert_eq!(mined_tx_confirmations(None, None), 0);
    }

    #[test]
    fn mined_tx_with_height_uses_chain_tip_depth() {
        assert_eq!(mined_tx_confirmations(Some(100), Some(100)), 1);
        assert_eq!(mined_tx_confirmations(Some(90), Some(100)), 11);
        assert_eq!(mined_tx_confirmations(Some(100), None), 0);
    }

    #[test]
    fn mined_tx_with_block_height_ahead_of_tip_is_not_confirmed() {
        assert_eq!(mined_tx_confirmations(Some(3348407), Some(3348236)), 0);
        assert_eq!(mined_tx_confirmations(Some(101), Some(100)), 0);
    }

    #[test]
    fn mined_tx_with_height_but_missing_tip_is_not_confirmed() {
        assert_eq!(mined_tx_confirmations(Some(100), None), 0);
    }

    #[test]
    fn package_not_child_message_is_detected() {
        assert!(is_package_not_child_with_unconfirmed_parents_message(
            "transaction package not accepted: package-not-child-with-unconfirmed-parents"
        ));
        assert!(!is_package_not_child_with_unconfirmed_parents_message(
            "min relay fee not met"
        ));
    }

    #[test]
    fn status_confirmed_without_raw_is_not_treated_as_mined() {
        assert_eq!(
            confirmations_if_status_confirmed_on_network(true, Some(100), Some(100), false),
            Some(0)
        );
        assert_eq!(
            confirmations_if_status_confirmed_on_network(false, Some(100), Some(100), true),
            None
        );
    }

    #[test]
    fn status_confirmed_with_raw_uses_chain_tip_depth() {
        assert_eq!(
            confirmations_if_status_confirmed_on_network(true, Some(100), Some(100), true),
            Some(1)
        );
        assert_eq!(
            confirmations_if_status_confirmed_on_network(true, Some(90), Some(100), true),
            Some(11)
        );
        assert_eq!(
            confirmations_if_status_confirmed_on_network(true, Some(101), Some(100), true),
            Some(0)
        );
    }
}
