use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use ark_client::Blockchain;
use ark_core::BoardingOutput;
use ark_core::ExplorerUtxo;
use ark_core::history::Transaction;
use bitcoin::Txid;

use crate::api_types::BoardingStatusDto;
use crate::error::ArkResult;
use crate::error::ArkWasmError;
use crate::outpoint::OnchainOutPoint;
use crate::persistence::SharedPersistenceDb;

use super::ArkadeSession;
use super::mappers::{
    accumulate_boarding_utxo_balance, is_past_arkd_cooperative_boarding_window, wasm_safe_now,
};

/// Boarding amounts and UTXOs from one pass over the loaded addresses.
pub(crate) struct BoardingAddressScan {
    pub spendable_sats: u64,
    pub pending_sats: u64,
    pub expired_sats: u64,
    pub utxos: Vec<ExplorerUtxo>,
}

/// List each boarding address once and classify its UTXOs.
pub(crate) async fn scan_boarding_addresses<B: Blockchain>(
    blockchain: &B,
    boarding_outputs: &[BoardingOutput],
    now: Duration,
) -> ArkResult<BoardingAddressScan> {
    let mut spendable_sats = 0u64;
    let mut pending_sats = 0u64;
    let mut expired_sats = 0u64;
    let mut scanned_utxos = Vec::new();

    for boarding_output in boarding_outputs {
        let utxos = blockchain.find_outpoints(boarding_output.address()).await?;
        for utxo in &utxos {
            accumulate_boarding_utxo_balance(
                utxo,
                boarding_output,
                now,
                &mut spendable_sats,
                &mut pending_sats,
                &mut expired_sats,
            );
        }
        scanned_utxos.extend(utxos);
    }

    Ok(BoardingAddressScan {
        spendable_sats,
        pending_sats,
        expired_sats,
        utxos: scanned_utxos,
    })
}

/// Spending txid of each scanned UTXO. One `get_output_status` per UTXO.
pub(crate) async fn commitment_txids_from_boarding_scan<B: Blockchain>(
    blockchain: &B,
    scan: &BoardingAddressScan,
) -> ArkResult<Vec<Txid>> {
    let mut boarding_commitment_transactions = Vec::new();
    for utxo in &scan.utxos {
        let onchain_outpoint = OnchainOutPoint::from_bitcoin_outpoint(utxo.outpoint);
        let status = blockchain
            .get_output_status(onchain_outpoint.txid(), onchain_outpoint.vout())
            .await?;
        if let Some(spend_txid) = status.spend_txid {
            boarding_commitment_transactions.push(spend_txid);
        }
    }
    Ok(boarding_commitment_transactions)
}

/// Boarding history rows from a scan that already listed the addresses.
pub(crate) fn boarding_history_transactions_from_scan(
    scan: &BoardingAddressScan,
) -> Vec<Transaction> {
    scan.utxos
        .iter()
        .map(|utxo| Transaction::Boarding {
            txid: utxo.outpoint.txid,
            amount: utxo.amount,
            confirmed_at: utxo
                .confirmation_blocktime
                .map(|timestamp| timestamp as i64),
        })
        .collect()
}

impl ArkadeSession {
    pub(crate) fn persist_watched_boarding_outputs(&self) -> ArkResult<()> {
        let rows = self
            .client
            .boarding_outputs_for_persistence()
            .map_err(ArkWasmError::Client)?;
        let persistence = SharedPersistenceDb(Arc::clone(&self.wallet_db));
        for (secret_key, boarding_output) in rows {
            persistence
                .save_boarding_output(secret_key, boarding_output)
                .map_err(ArkWasmError::Client)?;
        }
        Ok(())
    }

    pub fn boarding_address(&self) -> ArkResult<String> {
        self.persist_watched_boarding_outputs()?;
        Ok(self.client.cached_boarding_address()?.to_string())
    }

    pub async fn boarding_status(&self) -> ArkResult<BoardingStatusDto> {
        self.persist_watched_boarding_outputs()?;
        let finalized_commitment_txid = self.reconcile_pending_batch_intents().await?;
        let boarding_address = self.client.cached_boarding_address()?.to_string();
        let tracked_addresses = self
            .wallet_db
            .snapshot()
            .boarding_outputs
            .iter()
            .map(|row| row.address.clone())
            .collect::<Vec<_>>();
        let scan = self.scan_persisted_boarding_outputs().await?;

        Ok(BoardingStatusDto {
            boarding_address,
            tracked_addresses,
            spendable_sats: scan.spendable_sats,
            pending_sats: scan.pending_sats,
            expired_sats: scan.expired_sats,
            pending_batch_intents: self.pending_batch_intents_dto(),
            finalized_commitment_txid,
        })
    }

    pub(crate) async fn scan_persisted_boarding_outputs(&self) -> ArkResult<BoardingAddressScan> {
        let persistence = SharedPersistenceDb(Arc::clone(&self.wallet_db));
        let boarding_outputs = persistence.load_boarding_outputs()?;
        scan_boarding_addresses(self.client.blockchain(), &boarding_outputs, wasm_safe_now()).await
    }

    /// Newest confirmed boarding UTXO still inside arkd's cooperative settle window.
    pub(crate) async fn newest_cooperative_boarding_outpoint(
        &self,
    ) -> ArkResult<Option<OnchainOutPoint>> {
        let persistence = SharedPersistenceDb(Arc::clone(&self.wallet_db));
        let boarding_outputs = persistence.load_boarding_outputs()?;
        let now_secs = wasm_safe_now().as_secs();
        let mut scanned_addresses = HashSet::new();
        let mut newest: Option<(OnchainOutPoint, u64)> = None;

        for boarding_output in boarding_outputs {
            let address = boarding_output.address();
            if !scanned_addresses.insert(address.clone()) {
                continue;
            }

            let outpoints = self.client.blockchain().find_outpoints(address).await?;

            for utxo in outpoints {
                let ExplorerUtxo {
                    outpoint,
                    confirmation_blocktime: Some(confirmation_blocktime),
                    confirmations,
                    is_spent: false,
                    ..
                } = utxo
                else {
                    continue;
                };

                if boarding_output.can_be_claimed_unilaterally_by_owner(
                    wasm_safe_now(),
                    std::time::Duration::from_secs(confirmation_blocktime),
                    confirmations,
                ) {
                    continue;
                }

                if is_past_arkd_cooperative_boarding_window(
                    &boarding_output,
                    confirmation_blocktime,
                    now_secs,
                ) {
                    continue;
                }

                if newest.is_none_or(|(_, ts)| confirmation_blocktime > ts) {
                    newest = Some((
                        OnchainOutPoint::from_bitcoin_outpoint(outpoint),
                        confirmation_blocktime,
                    ));
                }
            }
        }

        Ok(newest.map(|(outpoint, _)| outpoint))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::str::FromStr;
    use std::sync::Mutex;
    use std::time::Duration;

    use ark_client::{Blockchain, Error, SpendStatus, TxStatus};
    use ark_core::BoardingOutput;
    use ark_core::ExplorerUtxo;
    use bitcoin::hashes::Hash;
    use bitcoin::key::Secp256k1;
    use bitcoin::{Address, Amount, OutPoint, Sequence, Transaction, Txid, XOnlyPublicKey};

    use super::{
        boarding_history_transactions_from_scan, commitment_txids_from_boarding_scan,
        scan_boarding_addresses,
    };

    struct CountingBlockchain {
        find_outpoints_calls: Mutex<HashMap<String, u32>>,
        output_status_calls: Mutex<u32>,
    }

    impl CountingBlockchain {
        fn new() -> Self {
            Self {
                find_outpoints_calls: Mutex::new(HashMap::new()),
                output_status_calls: Mutex::new(0),
            }
        }
    }

    impl Blockchain for CountingBlockchain {
        async fn find_outpoints(&self, address: &Address) -> Result<Vec<ExplorerUtxo>, Error> {
            let address_key = address.to_string();
            let mut calls = self
                .find_outpoints_calls
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            *calls.entry(address_key).or_insert(0) += 1;
            Ok(vec![ExplorerUtxo {
                outpoint: OutPoint {
                    txid: Txid::from_byte_array([1; 32]),
                    vout: 0,
                },
                amount: Amount::from_sat(50_000),
                confirmation_blocktime: Some(1_700_000_000),
                confirmations: 1,
                is_spent: false,
            }])
        }

        async fn find_tx(&self, _txid: &Txid) -> Result<Option<Transaction>, Error> {
            Ok(None)
        }

        async fn get_tx_status(&self, _txid: &Txid) -> Result<TxStatus, Error> {
            Ok(TxStatus { confirmed_at: None })
        }

        async fn get_output_status(&self, _txid: &Txid, _vout: u32) -> Result<SpendStatus, Error> {
            let mut calls = self
                .output_status_calls
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            *calls += 1;
            Ok(SpendStatus { spend_txid: None })
        }

        async fn broadcast(&self, _tx: &Transaction) -> Result<(), Error> {
            Ok(())
        }

        async fn get_fee_rate(&self) -> Result<f64, Error> {
            Ok(1.0)
        }

        async fn broadcast_package(&self, _txs: &[&Transaction]) -> Result<(), Error> {
            Ok(())
        }
    }

    fn boarding_output(owner_hex: &str) -> BoardingOutput {
        let secp = Secp256k1::new();
        let server = XOnlyPublicKey::from_str(
            "18845781f631c48f1c9709e23092067d06837f30aa0cd0544ac887fe91ddd166",
        )
        .expect("valid server key");
        let owner = XOnlyPublicKey::from_str(owner_hex).expect("valid owner key");
        BoardingOutput::new(
            &secp,
            server,
            owner,
            Sequence::from_consensus(144),
            bitcoin::Network::Signet,
        )
        .expect("valid boarding output")
    }

    #[tokio::test]
    async fn live_dashboard_lists_each_boarding_address_once() {
        let first =
            boarding_output("28845781f631c48f1c9709e23092067d06837f30aa0cd0544ac887fe91ddd166");
        let second =
            boarding_output("79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798");
        let outputs = [first, second];
        let blockchain = CountingBlockchain::new();

        let scan =
            scan_boarding_addresses(&blockchain, &outputs, Duration::from_secs(1_700_000_100))
                .await
                .expect("boarding scan");
        let commitment_txids = commitment_txids_from_boarding_scan(&blockchain, &scan)
            .await
            .expect("commitment txids");
        let history = boarding_history_transactions_from_scan(&scan);

        let find_calls = blockchain
            .find_outpoints_calls
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        assert_eq!(find_calls.len(), 2);
        assert!(find_calls.values().all(|count| *count == 1));
        assert_eq!(
            *blockchain
                .output_status_calls
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
            2
        );
        assert!(commitment_txids.is_empty());
        assert_eq!(history.len(), 2);
        assert_eq!(scan.spendable_sats, 100_000);
    }
}
