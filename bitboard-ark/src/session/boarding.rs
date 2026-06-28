use std::collections::HashSet;
use std::sync::Arc;

use ark_client::Blockchain;
use ark_client::wallet::Persistence;
use ark_core::ExplorerUtxo;
use ark_core::history::Transaction;
use bitcoin::OutPoint;

use crate::api_types::BoardingStatusDto;
use crate::error::ArkResult;
use crate::persistence::SharedPersistenceDb;

use super::ArkSession;
use super::mappers::{
    accumulate_boarding_utxo_balance, is_past_arkd_cooperative_boarding_window, wasm_safe_now,
};

impl ArkSession {
    pub fn boarding_address(&self) -> ArkResult<String> {
        Ok(self.client.get_boarding_address()?.to_string())
    }

    pub async fn boarding_status(&self) -> ArkResult<BoardingStatusDto> {
        let boarding_address = self.client.get_boarding_address()?.to_string();
        let persistence = SharedPersistenceDb(Arc::clone(&self.wallet_db));
        let boarding_outputs = persistence.load_boarding_outputs()?;
        let tracked_addresses = self
            .wallet_db
            .snapshot()
            .boarding_outputs
            .iter()
            .map(|row| row.address.clone())
            .collect::<Vec<_>>();

        let now = wasm_safe_now();
        let mut spendable_sats = 0u64;
        let mut pending_sats = 0u64;
        let mut expired_sats = 0u64;

        for boarding_output in &boarding_outputs {
            let outpoints = self
                .client
                .blockchain()
                .find_outpoints(boarding_output.address())
                .await?;

            for utxo in outpoints {
                accumulate_boarding_utxo_balance(
                    &utxo,
                    boarding_output,
                    now,
                    &mut spendable_sats,
                    &mut pending_sats,
                    &mut expired_sats,
                );
            }
        }

        Ok(BoardingStatusDto {
            boarding_address,
            tracked_addresses,
            spendable_sats,
            pending_sats,
            expired_sats,
        })
    }

    pub(crate) async fn boarding_commitment_txids(&self) -> ArkResult<Vec<bitcoin::Txid>> {
        let persistence = SharedPersistenceDb(Arc::clone(&self.wallet_db));
        let boarding_outputs = persistence.load_boarding_outputs()?;
        let mut boarding_commitment_transactions = Vec::new();

        for boarding_output in &boarding_outputs {
            let outpoints = self
                .client
                .blockchain()
                .find_outpoints(boarding_output.address())
                .await?;

            for ExplorerUtxo { outpoint, .. } in outpoints {
                let status = self
                    .client
                    .blockchain()
                    .get_output_status(&outpoint.txid, outpoint.vout)
                    .await?;
                if let Some(spend_txid) = status.spend_txid {
                    boarding_commitment_transactions.push(spend_txid);
                }
            }
        }

        Ok(boarding_commitment_transactions)
    }

    pub(crate) async fn boarding_history_transactions(&self) -> ArkResult<Vec<Transaction>> {
        let persistence = SharedPersistenceDb(Arc::clone(&self.wallet_db));
        let boarding_outputs = persistence.load_boarding_outputs()?;
        let mut boarding_transactions = Vec::new();

        for boarding_output in &boarding_outputs {
            let outpoints = self
                .client
                .blockchain()
                .find_outpoints(boarding_output.address())
                .await?;

            for ExplorerUtxo {
                outpoint,
                amount,
                confirmation_blocktime,
                ..
            } in outpoints
            {
                boarding_transactions.push(Transaction::Boarding {
                    txid: outpoint.txid,
                    amount,
                    confirmed_at: confirmation_blocktime.map(|timestamp| timestamp as i64),
                });
            }
        }

        Ok(boarding_transactions)
    }

    /// Newest confirmed boarding UTXO still inside arkd's cooperative settle window.
    pub(crate) async fn newest_cooperative_boarding_outpoint(&self) -> ArkResult<Option<OutPoint>> {
        let persistence = SharedPersistenceDb(Arc::clone(&self.wallet_db));
        let boarding_outputs = persistence.load_boarding_outputs()?;
        let now_secs = wasm_safe_now().as_secs();
        let mut scanned_addresses = HashSet::new();
        let mut newest: Option<(OutPoint, u64)> = None;

        for boarding_output in boarding_outputs {
            let address = boarding_output.address();
            if !scanned_addresses.insert(address.clone()) {
                continue;
            }

            let outpoints = self.client.blockchain().find_outpoints(&address).await?;

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
                    newest = Some((outpoint, confirmation_blocktime));
                }
            }
        }

        Ok(newest.map(|(outpoint, _)| outpoint))
    }
}
