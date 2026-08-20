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

const ESPLORA_HTTP_TIMEOUT_SECS: u64 = 5;

/// Mempool's `/txs/package` handler calls `parseFloat(req.query.maxfeerate)` and forwards the
/// value to bitcoind. When query params are omitted that becomes `NaN`, which makes
/// `submitpackage` fail with a generic RPC error. Always send explicit limits (0 = accept any).
const SUBMIT_PACKAGE_MAX_FEE_RATE_BTC_PER_KVB: f64 = 0.0;
const SUBMIT_PACKAGE_MAX_BURN_AMOUNT_BTC: f64 = 0.0;

const AGENT_DEBUG_SESSION_ID: &str = "2d2162";
const AGENT_DEBUG_LOG_PATH: &str =
    "/home/radivis/projects/bitboard-pwa-wallet/.cursor/debug-2d2162.log";
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const AGENT_DEBUG_INGEST_URL: &str =
    "http://127.0.0.1:7757/ingest/cb0f3ed4-7e87-43d6-b1dd-18329fa2e328";

#[derive(Default)]
struct ConfirmationCache {
    scan_prepared: bool,
    tip_height: Option<u32>,
    confirmed_at_tip: HashMap<Txid, u64>,
}

struct CachedOutspends {
    spend_txids: Vec<Option<Txid>>,
    fetched_at_ms: u64,
}

#[derive(Default)]
struct OutspendCache {
    by_txid: HashMap<Txid, CachedOutspends>,
}

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

fn agent_debug_log(hypothesis_id: &str, location: &str, message: &str, data: serde_json::Value) {
    let mut payload = serde_json::json!({
        "sessionId": AGENT_DEBUG_SESSION_ID,
        "hypothesisId": hypothesis_id,
        "runId": "post-fix",
        "location": location,
        "message": message,
        "data": data,
        "timestamp": 0u64,
    });
    #[cfg(target_arch = "wasm32")]
    {
        let payload_js = payload
            .to_string()
            .replace('\\', "\\\\")
            .replace('\'', "\\'");
        let script = format!(
            "fetch('{AGENT_DEBUG_INGEST_URL}',{{method:'POST',headers:{{'Content-Type':'application/json','X-Debug-Session-Id':'{AGENT_DEBUG_SESSION_ID}'}},body:JSON.stringify(Object.assign(JSON.parse('{payload_js}'),{{timestamp:Date.now()}}))}}).catch(function(){{}})"
        );
        let _ = js_sys::eval(&script);
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        if let Some(object) = payload.as_object_mut() {
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(0);
            object.insert("timestamp".into(), serde_json::json!(timestamp));
        }
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(AGENT_DEBUG_LOG_PATH)
        {
            use std::io::Write;
            let _ = writeln!(file, "{payload}");
        }
    }
}

#[cfg(target_arch = "wasm32")]
type EsploraAsyncClient = esplora_client::AsyncClient<crate::wasm_sleep::WasmSleeper>;
#[cfg(not(target_arch = "wasm32"))]
type EsploraAsyncClient = esplora_client::AsyncClient;

pub struct EsploraBlockchain {
    client: Arc<EsploraAsyncClient>,
    confirmation_cache: Mutex<ConfirmationCache>,
    outspend_cache: Arc<Mutex<OutspendCache>>,
}

impl EsploraBlockchain {
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

    fn map_esplora_error(error: esplora_client::Error) -> ark_client::Error {
        ark_client::Error::wallet(error.to_string())
    }

    async fn find_outpoints_at(
        client: &EsploraAsyncClient,
        address: &Address,
    ) -> Result<Vec<ExplorerUtxo>, ark_client::Error> {
        collect_address_utxos(client, address).await
    }

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

    async fn get_tx_status_at(
        client: &EsploraAsyncClient,
        txid: &Txid,
    ) -> Result<TxStatus, ark_client::Error> {
        map_tx_status(client, txid).await
    }

    pub async fn get_tx_confirmations(&self, txid: &Txid) -> ArkResult<u64> {
        if !self.confirmation_scan_is_prepared() {
            self.prepare_confirmation_scan().await;
        }
        if let Some(confirmations) = self.cached_confirmed_at_tip(txid) {
            return Ok(confirmations);
        }
        let client = Arc::clone(&self.client);
        let txid = *txid;
        let tip_height = self.cached_tip_height();
        let confirmations = map_tx_confirmations(&client, &txid, tip_height)
            .await
            .map_err(|error| ArkWasmError::Blockchain(error.to_string()))?;
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
            cache.tip_height = tip_height;
        }
        cache.scan_prepared = true;
    }

    pub fn cached_tip_height(&self) -> Option<u32> {
        self.confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .tip_height
    }

    fn confirmation_scan_is_prepared(&self) -> bool {
        self.confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .scan_prepared
    }

    fn cached_confirmed_at_tip(&self, txid: &Txid) -> Option<u64> {
        self.confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .confirmed_at_tip
            .get(txid)
            .copied()
    }

    pub(crate) fn store_confirmed_at_tip(&self, txid: Txid, confirmations: u64) {
        self.confirmation_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .confirmed_at_tip
            .insert(txid, confirmations);
    }

    /// Extra GETs for RCA dual-read. Call only on skip-jumps or `package-not-child` — not per step.
    pub async fn debug_tx_spendability_probe(&self, txid: &Txid) -> serde_json::Value {
        let status = self.client.get_tx_status(txid).await.ok();
        let raw_present = self.client.get_tx(txid).await.ok().flatten().is_some();
        let tip_height = self.client.get_height().await.ok();
        let in_best_chain = match status.as_ref().and_then(|status| status.block_hash) {
            Some(block_hash) => self
                .client
                .get_block_status(&block_hash)
                .await
                .ok()
                .map(|block_status| block_status.in_best_chain),
            None => None,
        };
        let esplora_confs = status.as_ref().map(|status| {
            if !status.confirmed {
                0
            } else {
                mined_tx_confirmations(status.block_height, tip_height)
            }
        });
        serde_json::json!({
            "txid": txid.to_string(),
            "statusConfirmed": status.as_ref().map(|status| status.confirmed),
            "blockHeight": status.as_ref().and_then(|status| status.block_height),
            "hasBlockHash": status.as_ref().map(|status| status.block_hash.is_some()),
            "tipHeight": tip_height,
            "esploraConfs": esplora_confs,
            "rawPresent": raw_present,
            "inBestChain": in_best_chain,
        })
    }

    /// True when `/tx/{txid}/raw` returns a transaction (mempool or chain).
    ///
    /// Unlike [`Self::find_tx_at`], this does not fall back to JSON-only `/tx/{txid}` entries that
    /// arkade-regtest serves for virtual-tree artifacts before they are relayed.
    ///
    /// See `docs/arkade-regtest-esplora-quirks.md` — use for **broadcast gating only**, not step completion.
    pub async fn is_tx_relayed_on_network(&self, txid: &Txid) -> ArkResult<bool> {
        let client = Arc::clone(&self.client);
        let txid = *txid;
        Ok(client
            .get_tx(&txid)
            .await
            .map_err(EsploraBlockchain::map_esplora_error)?
            .is_some())
    }

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

    async fn get_fee_rate_at(client: &EsploraAsyncClient) -> Result<f64, ark_client::Error> {
        map_fee_rate(client).await
    }

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
                if is_package_not_child_with_unconfirmed_parents_message(&error.to_string()) {
                    // #region agent log
                    agent_debug_log(
                        "H3",
                        "esplora_blockchain.rs:broadcast_package_at",
                        "submitpackage rejected package-not-child",
                        serde_json::json!({
                            "packageTxids": owned_transactions
                                .iter()
                                .map(|tx| tx.compute_txid().to_string())
                                .collect::<Vec<_>>(),
                            "packageInputs": Self::package_input_outpoints(&owned_transactions),
                            "error": error.to_string(),
                        }),
                    );
                    // #endregion
                }
                return Err(EsploraBlockchain::map_esplora_error(error));
            }
        };
        if let Err(error) = validate_submit_package_result(&package_result) {
            if is_package_not_child_with_unconfirmed_parents_message(&error.to_string()) {
                // #region agent log
                agent_debug_log(
                    "H3",
                    "esplora_blockchain.rs:broadcast_package_at",
                    "submitpackage result package-not-child",
                    serde_json::json!({
                        "packageTxids": owned_transactions
                            .iter()
                            .map(|tx| tx.compute_txid().to_string())
                            .collect::<Vec<_>>(),
                        "packageInputs": Self::package_input_outpoints(&owned_transactions),
                        "packageMsg": package_result.package_msg,
                        "error": error.to_string(),
                    }),
                );
                // #endregion
            }
            return Err(error);
        }
        Ok(())
    }

    fn package_input_outpoints(txs: &[bitcoin::Transaction]) -> Vec<Vec<String>> {
        txs.iter()
            .map(|tx| {
                tx.input
                    .iter()
                    .map(|input| {
                        format!(
                            "{}:{}",
                            input.previous_output.txid, input.previous_output.vout
                        )
                    })
                    .collect()
            })
            .collect()
    }

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

macro_rules! impl_esplora_blockchain {
    ($($send_bound:tt)*) => {
        impl Blockchain for EsploraBlockchain {
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

            fn get_tx_status(
                &self,
                txid: &Txid,
            ) -> impl std::future::Future<Output = Result<TxStatus, ark_client::Error>> $($send_bound)*
            {
                let client = Arc::clone(&self.client);
                let txid = *txid;
                async move { EsploraBlockchain::get_tx_status_at(&client, &txid).await }
            }

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

            fn broadcast(
                &self,
                tx: &Transaction,
            ) -> impl std::future::Future<Output = Result<(), ark_client::Error>> $($send_bound)*
            {
                let client = Arc::clone(&self.client);
                let tx = tx.clone();
                async move { EsploraBlockchain::broadcast_at(&client, &tx).await }
            }

            fn get_fee_rate(
                &self,
            ) -> impl std::future::Future<Output = Result<f64, ark_client::Error>> $($send_bound)*
            {
                let client = Arc::clone(&self.client);
                async move { EsploraBlockchain::get_fee_rate_at(&client).await }
            }

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

fn confirmations_from_esplora_tx_status(
    status: &esplora_client::api::TxStatus,
    chain_tip_height: Option<u32>,
) -> u64 {
    if !status.confirmed {
        return 0;
    }
    if let (Some(block_height), Some(tip_height)) = (status.block_height, chain_tip_height) {
        if tip_height < block_height {
            // #region agent log
            agent_debug_log(
                "H4",
                "esplora_blockchain.rs:confirmations_from_esplora_tx_status",
                "rejecting confirmation because tip is behind claimed block height",
                serde_json::json!({
                    "blockHeight": block_height,
                    "tipHeight": tip_height,
                }),
            );
            // #endregion
        }
    }
    mined_tx_confirmations(status.block_height, chain_tip_height)
}

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

fn is_missing_tx_esplora_error(error: &esplora_client::Error) -> bool {
    match error {
        esplora_client::Error::HttpResponse { message, .. } => {
            let lowered = message.to_ascii_lowercase();
            lowered.contains("no such mempool or blockchain transaction")
        }
        _ => false,
    }
}

/// When `/status` is missing or still reports unconfirmed, consult relay + JSON status.
/// Virtual-tree indexes can serve `confirmed: false` from `/status` even after a mined broadcast.
async fn confirmations_for_relayed_tx(
    client: &EsploraAsyncClient,
    txid: &Txid,
    chain_tip_height: Option<u32>,
) -> Result<u64, ark_client::Error> {
    let relayed = client
        .get_tx(txid)
        .await
        .map_err(EsploraBlockchain::map_esplora_error)?
        .is_some();
    if !relayed {
        return Ok(0);
    }
    let Some(tx_info) = client
        .get_tx_info(txid)
        .await
        .map_err(EsploraBlockchain::map_esplora_error)?
    else {
        return Ok(0);
    };
    Ok(confirmations_from_esplora_tx_status(
        &tx_info.status,
        chain_tip_height,
    ))
}

async fn map_tx_status(
    client: &EsploraAsyncClient,
    txid: &Txid,
) -> Result<TxStatus, ark_client::Error> {
    let status = esplora_tx_status(client, txid).await?;
    Ok(TxStatus {
        confirmed_at: status.and_then(|status| status.block_time.map(|time| time as i64)),
    })
}

async fn map_tx_confirmations(
    client: &EsploraAsyncClient,
    txid: &Txid,
    chain_tip_height: Option<u32>,
) -> Result<u64, ark_client::Error> {
    match client.get_tx_status(txid).await {
        Ok(status) if status.confirmed => {
            return Ok(confirmations_from_esplora_tx_status(
                &status,
                chain_tip_height,
            ));
        }
        Ok(_) => {}
        Err(esplora_client::Error::HttpResponse { status: 404, .. }) => {}
        Err(error) => return Err(EsploraBlockchain::map_esplora_error(error)),
    }

    confirmations_for_relayed_tx(client, txid, chain_tip_height).await
}

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

async fn fetch_and_store_outspends(
    client: &EsploraAsyncClient,
    cache: &Mutex<OutspendCache>,
    txid: &Txid,
) -> Result<Vec<Option<Txid>>, ark_client::Error> {
    let spend_txids = load_tx_outspend_txids(client, txid).await?;
    store_outspends(cache, *txid, spend_txids.clone());
    Ok(spend_txids)
}

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

fn is_mempool_submitpackage_rpc_error(message: &str) -> bool {
    message.contains("submitpackage RPC error")
}

fn is_transaction_already_relayed_error(error: &esplora_client::Error) -> bool {
    match error {
        esplora_client::Error::HttpResponse { message, .. } => {
            is_already_relayed_broadcast_error_message(message)
        }
        _ => false,
    }
}

pub(crate) fn is_redundant_unilateral_exit_broadcast_error(error: &ark_client::Error) -> bool {
    is_already_relayed_broadcast_error_message(&error.to_string())
}

/// Injecting an unroll parent into the submit mempool can fail because that node already
/// has the original CPFP or the parent in a block. Retry the child anyway.
pub(crate) fn ancestor_inject_is_ignorable(error: &ark_client::Error) -> bool {
    ancestor_inject_is_ignorable_message(&error.to_string())
}

fn ancestor_inject_is_ignorable_message(message: &str) -> bool {
    if is_already_relayed_broadcast_error_message(message) {
        return true;
    }
    let lowered = message.to_ascii_lowercase();
    lowered.contains("missingorspent")
        || lowered.contains("missing-inputs")
        || lowered.contains("bad-txns-inputs-spent")
        || lowered.contains("already in block")
        || lowered.contains("txn-already-known")
}

pub(crate) fn is_package_not_child_with_unconfirmed_parents_error(
    error: &ark_client::Error,
) -> bool {
    is_package_not_child_with_unconfirmed_parents_message(&error.to_string())
}

fn is_package_not_child_with_unconfirmed_parents_message(message: &str) -> bool {
    message
        .to_ascii_lowercase()
        .contains("package-not-child-with-unconfirmed-parents")
}

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

    use super::ancestor_inject_is_ignorable_message;
    use super::is_mempool_submitpackage_rpc_error;
    use super::is_missing_tx_esplora_error;
    use super::is_package_not_child_with_unconfirmed_parents_message;
    use super::is_transaction_already_relayed_error;
    use super::mined_tx_confirmations;
    use super::utxo_confirmations;
    use super::validate_submit_package_result;

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
    fn ancestor_inject_ignores_already_known_or_spent_parents() {
        assert!(ancestor_inject_is_ignorable_message(
            "txn-already-in-mempool"
        ));
        assert!(ancestor_inject_is_ignorable_message(
            "bad-txns-inputs-missingorspent"
        ));
        assert!(!ancestor_inject_is_ignorable_message(
            "min relay fee not met"
        ));
    }
}
