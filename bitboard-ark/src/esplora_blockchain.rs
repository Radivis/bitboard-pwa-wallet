use std::sync::Arc;

use ark_client::{Blockchain, SpendStatus, TxStatus};
use ark_core::ExplorerUtxo;
use bitcoin::{Address, OutPoint, Transaction, Txid};

use crate::constants::{ESPLORA_FEE_ESTIMATE_BLOCK_TARGET, MIN_FEE_RATE_SAT_PER_VB};
use crate::error::{ArkResult, ArkWasmError};

const ESPLORA_HTTP_TIMEOUT_SECS: u64 = 5;

#[cfg(target_arch = "wasm32")]
type EsploraAsyncClient = esplora_client::AsyncClient<crate::wasm_sleep::WasmSleeper>;
#[cfg(not(target_arch = "wasm32"))]
type EsploraAsyncClient = esplora_client::AsyncClient;

pub struct EsploraBlockchain {
    client: Arc<EsploraAsyncClient>,
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
                .build_async_with_sleeper::<WasmSleeper>()
                .map_err(|error| ArkWasmError::Blockchain(error.to_string()))?
        };

        #[cfg(not(target_arch = "wasm32"))]
        let client = esplora_client::Builder::new(esplora_url)
            .timeout(ESPLORA_HTTP_TIMEOUT_SECS)
            .build_async_with_sleeper()
            .map_err(|error| ArkWasmError::Blockchain(error.to_string()))?;

        Ok(Self {
            client: Arc::new(client),
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

    async fn get_output_status_at(
        client: &EsploraAsyncClient,
        txid: &Txid,
        vout: u32,
    ) -> Result<SpendStatus, ark_client::Error> {
        map_output_status(client, txid, vout).await
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
        let package_result = match client.submit_package(&owned_transactions, None, None).await {
            Ok(result) => result,
            Err(esplora_client::Error::HttpResponse { status: 404, .. }) => {
                return Err(ark_client::Error::wallet(
                    "Esplora does not support transaction package broadcast (/txs/package). \
                     Unilateral exit unroll requires CPFP package relay so the fee-bumping child \
                     can pay for the zero-fee parent transaction."
                        .to_string(),
                ));
            }
            Err(error) => return Err(EsploraBlockchain::map_esplora_error(error)),
        };
        validate_submit_package_result(&package_result)
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
                let txid = *txid;
                async move { EsploraBlockchain::get_output_status_at(&client, &txid, vout).await }
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
        let outpoint = OutPoint {
            txid: utxo.txid,
            vout: utxo.vout,
        };
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

async fn map_tx_status(
    client: &EsploraAsyncClient,
    txid: &Txid,
) -> Result<TxStatus, ark_client::Error> {
    let status = client
        .get_tx_status(txid)
        .await
        .map_err(EsploraBlockchain::map_esplora_error)?;
    Ok(TxStatus {
        confirmed_at: status.block_time.map(|time| time as i64),
    })
}

async fn map_output_status(
    client: &EsploraAsyncClient,
    txid: &Txid,
    vout: u32,
) -> Result<SpendStatus, ark_client::Error> {
    let outspends = client
        .get_tx_outspends(txid)
        .await
        .map_err(EsploraBlockchain::map_esplora_error)?;
    let spend_txid = outspends.get(vout as usize).and_then(|output| output.txid);
    Ok(SpendStatus { spend_txid })
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

    use super::utxo_confirmations;
    use super::validate_submit_package_result;

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
}
