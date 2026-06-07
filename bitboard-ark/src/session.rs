use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use ark_bdk_wallet::Wallet as ArkBdkWallet;
use ark_client::wallet::Persistence;
use ark_client::{
    Bip32KeyProvider, Blockchain, Client, DEFAULT_GAP_LIMIT, InMemorySwapStorage, OfflineClient,
};
use ark_core::ArkAddress;
use ark_core::BoardingOutput;
use ark_core::ExplorerUtxo;
use ark_core::history::Transaction;
use ark_core::send::SendReceiver;
use ark_core::server::VirtualTxOutPoint;
use ark_delegator::DelegatorClient;
use bip39::Mnemonic;
use bitcoin::bip32::Xpriv;
use bitcoin::key::Secp256k1;
use bitcoin::secp256k1::rand::rngs::OsRng;
use bitcoin::{Address, Amount, Network, OutPoint, PublicKey, XOnlyPublicKey};

use crate::api_types::{
    BalanceDto, BoardingStatusDto, CollaborativeExitFeeEstimateDto, CollaborativeExitParams,
    CompleteUnilateralExitParams, DelegateInfoDto, DelegateSpendableResult, ExitCandidateRow,
    FinalizePendingResult, IntentFeeConfiguredDto, OnchainBumperInfoDto, PaymentRowDto,
    SendPaymentParams, UnilateralExitFeeEstimateDto, UnilateralExitFeeParams, UnrollProgressEvent,
    UnrollResult,
};
use crate::error::{ArkResult, ArkWasmError};
use crate::esplora_blockchain::EsploraBlockchain;
use crate::network::NetworkMode;
use crate::persistence::{
    BITBOARD_ARK_PERSISTENCE_VERSION, BitboardArkPersistenceV2, JsonPersistenceDb,
    SharedPersistenceDb,
};

const CLIENT_NAME: &str = "bitboard-pwa-wallet";
const BOLTZ_URL: &str = "https://api.boltz.exchange";
const CLIENT_TIMEOUT: Duration = Duration::from_secs(30);
const SELF_RENEW_REMAINING_FRACTION: f64 = 0.10;
const UNILATERAL_CHILD_VSIZE: u64 = 140;

pub type ArkWallet = ArkBdkWallet<SharedPersistenceDb>;
pub type ArkClient = Client<EsploraBlockchain, ArkWallet, InMemorySwapStorage, Bip32KeyProvider>;

pub struct ArkSession {
    client: ArkClient,
    wallet_db: Arc<JsonPersistenceDb>,
    delegator: Option<DelegatorClient>,
    network_mode: NetworkMode,
}

impl ArkSession {
    pub async fn open(
        mnemonic_words: &str,
        network_mode: NetworkMode,
        ark_server_url: String,
        delegator_url: String,
        esplora_url: String,
        sdk_persistence_json: Option<&str>,
    ) -> ArkResult<(Self, bool)> {
        let (persistence, reset_v1) = BitboardArkPersistenceV2::parse_import(sdk_persistence_json);
        let network = network_mode.to_bitcoin_network();

        let wallet_db = Arc::new(JsonPersistenceDb::from_snapshot(persistence.wallet_db));
        let secp = Secp256k1::new();
        let mnemonic = Mnemonic::parse(mnemonic_words)?;
        let seed = mnemonic.to_seed("");
        let xpriv = Xpriv::new_master(network, &seed)?;

        let (delegator, delegator_xonly) = if delegator_url.trim().is_empty() {
            (None, None)
        } else {
            let delegator = DelegatorClient::new(delegator_url.clone());
            let delegator_info = delegator.info().await?;
            let delegator_pk = parse_delegator_public_key(&delegator_info.pubkey)?;
            let delegator_xonly: XOnlyPublicKey = delegator_pk.into();
            (Some(delegator), Some(delegator_xonly))
        };

        let blockchain = Arc::new(EsploraBlockchain::new(&esplora_url)?);
        let wallet = Arc::new(
            ArkBdkWallet::new_from_xpriv(
                xpriv,
                secp,
                network,
                &esplora_url,
                SharedPersistenceDb(Arc::clone(&wallet_db)),
            )
            .map_err(|error| ArkWasmError::Message(error.to_string()))?,
        );

        let offline = OfflineClient::<
            EsploraBlockchain,
            ArkWallet,
            InMemorySwapStorage,
            Bip32KeyProvider,
        >::new_with_bip32(
            CLIENT_NAME.to_string(),
            xpriv,
            None,
            blockchain,
            wallet,
            ark_server_url,
            Arc::new(InMemorySwapStorage::new()),
            BOLTZ_URL.to_string(),
            None,
            CLIENT_TIMEOUT,
            delegator_xonly,
            vec![],
        );

        let client = offline.connect().await?;
        let server_signer: XOnlyPublicKey = client.server_info.signer_pk.into();
        wallet_db.set_load_context(network, server_signer);
        client.sync_onchain_wallet().await?;

        Ok((
            Self {
                client,
                wallet_db,
                delegator,
                network_mode,
            },
            reset_v1,
        ))
    }

    pub fn export_persistence(&self) -> ArkResult<String> {
        let envelope = BitboardArkPersistenceV2 {
            version: BITBOARD_ARK_PERSISTENCE_VERSION,
            engine: crate::persistence::ARK_RS_ENGINE.to_string(),
            ark_sdk_version: crate::persistence::ARK_RS_SDK_VERSION.to_string(),
            wallet_db: self.wallet_db.snapshot(),
            swap_storage: Default::default(),
        };
        Ok(serde_json::to_string(&envelope)?)
    }

    pub fn offchain_address(&self) -> ArkResult<String> {
        let (address, _) = self.client.get_offchain_address()?;
        Ok(address.to_string())
    }

    pub async fn balance(&self) -> ArkResult<BalanceDto> {
        self.sync_offchain_keys().await;
        let offchain = self.client.offchain_balance().await?;
        let onchain = self.client.onchain_wallet_balance()?;
        let confirmed = offchain.confirmed().to_sat() + onchain.confirmed.to_sat();
        let total = offchain.total().to_sat() + onchain.confirmed.to_sat();
        Ok(BalanceDto {
            confirmed_sats: confirmed,
            total_sats: total,
        })
    }

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
                .await
                .map_err(|error| ArkWasmError::Message(error.to_string()))?;

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

    pub async fn send_payment(&self, params: SendPaymentParams) -> ArkResult<String> {
        let address = ArkAddress::decode(&params.address)
            .map_err(|error| ArkWasmError::Message(error.to_string()))?;
        let amount = Amount::from_sat(params.amount_sats);
        let txid = self
            .client
            .send(vec![SendReceiver::bitcoin(address, amount)])
            .await?;
        Ok(txid.to_string())
    }

    pub async fn transaction_history(&self) -> ArkResult<Vec<PaymentRowDto>> {
        self.sync_offchain_keys().await;
        let rows = self
            .client
            .transaction_history()
            .await?
            .into_iter()
            .filter_map(map_history_row)
            .collect();
        Ok(rows)
    }

    pub async fn delegate_info(&self) -> ArkResult<DelegateInfoDto> {
        let delegator = self
            .delegator
            .as_ref()
            .ok_or_else(|| ArkWasmError::Message("delegator service is not configured".into()))?;
        let info = delegator.info().await?;
        let fee = info.fee.parse::<u64>().unwrap_or(0);
        Ok(DelegateInfoDto {
            pubkey: info.pubkey,
            fee,
            delegator_address: info.delegator_address,
        })
    }

    pub async fn expiring_vtxo_count(&self) -> ArkResult<u32> {
        Ok(self.expiring_outpoints().await?.len() as u32)
    }

    pub async fn renew_vtxos_now(&self) -> ArkResult<Option<String>> {
        let expiring = self.expiring_outpoints().await?;
        if expiring.is_empty() {
            return Ok(None);
        }
        let mut rng = OsRng;
        let txid = self.client.settle_vtxos(&mut rng, &expiring, &[]).await?;
        Ok(txid.map(|id| id.to_string()))
    }

    pub async fn delegate_spendable_vtxos(&self) -> ArkResult<DelegateSpendableResult> {
        let Some(delegator) = self.delegator.as_ref() else {
            return Ok(DelegateSpendableResult {
                delegated: 0,
                failed: 0,
            });
        };

        let delegator_info = delegator.info().await?;
        let delegator_pubkey = parse_delegator_public_key(&delegator_info.pubkey)?;
        let mut delegated = 0u32;
        let mut failed = 0u32;

        let cosigner_pk = delegator_pubkey.inner;
        match self.client.generate_delegate(cosigner_pk).await {
            Ok(mut delegate) => {
                if self
                    .client
                    .sign_delegate_psbts(&mut delegate.intent.proof, &mut delegate.forfeit_psbts)
                    .is_err()
                {
                    failed += 1;
                } else if delegator
                    .delegate(&delegate.intent, &delegate.forfeit_psbts, None)
                    .await
                    .is_ok()
                {
                    delegated = delegate.forfeit_psbts.len() as u32;
                } else {
                    failed += 1;
                }
            }
            Err(_) => {
                failed += 1;
            }
        }

        Ok(DelegateSpendableResult { delegated, failed })
    }

    pub async fn finalize_pending_transactions(&self) -> ArkResult<FinalizePendingResult> {
        let pending_before = self.client.list_pending_offchain_txs().await?.len();
        let finalized = self.client.continue_pending_offchain_txs().await?;
        let pending_after = self.client.list_pending_offchain_txs().await?.len();
        Ok(FinalizePendingResult {
            finalized: finalized.len() as u32,
            pending: pending_after.max(pending_before.saturating_sub(finalized.len())) as u32,
        })
    }

    pub async fn onboard_boarded_utxos(&self) -> ArkResult<Option<String>> {
        let status = self.boarding_status().await?;
        if status.spendable_sats == 0 {
            if status.pending_sats > 0 {
                return Err(ArkWasmError::Message(
                    "Boarding payment is unconfirmed. Wait for at least one block confirmation, then try again.".to_string(),
                ));
            }
            if status.expired_sats > 0 {
                return Err(ArkWasmError::Message(
                    "Boarding UTXO can only be spent unilaterally now. Use the unilateral exit flow instead of settle.".to_string(),
                ));
            }
            if status.tracked_addresses.is_empty() {
                return Err(ArkWasmError::Message(
                    "No boarding address is registered for this wallet session.".to_string(),
                ));
            }
            return Err(ArkWasmError::Message(format!(
                "No spendable boarding UTXO found at {}. Confirm the payment was sent to that exact address on {}.",
                status.boarding_address,
                self.network_mode.label(),
            )));
        }

        let mut rng = OsRng;
        match self.client.settle(&mut rng).await {
            Ok(Some(txid)) => Ok(Some(txid.to_string())),
            Ok(None) => Err(ArkWasmError::Message(
                "Settle returned no inputs even though boarding UTXOs looked spendable. Try again in a moment.".to_string(),
            )),
            Err(error) => Err(ArkWasmError::Message(error.to_string())),
        }
    }

    pub async fn list_exit_candidates(&self) -> ArkResult<Vec<ExitCandidateRow>> {
        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let dust = self.client.server_info.dust;
        let rows = vtxo_list
            .all()
            .map(|vtp| map_exit_candidate(vtp, dust))
            .collect();
        Ok(rows)
    }

    pub async fn onchain_bumper_info(&self) -> ArkResult<OnchainBumperInfoDto> {
        let address = self.client.onchain_wallet_address()?;
        let balance = self.client.onchain_wallet_balance()?;
        Ok(OnchainBumperInfoDto {
            address: address.to_string(),
            balance_sats: balance.confirmed.to_sat(),
        })
    }

    pub async fn collaborative_exit(&self, params: CollaborativeExitParams) -> ArkResult<String> {
        let destination = parse_onchain_address(&params.destination_address, self.network())?;
        let mut rng = OsRng;
        let txid = if let Some(amount_sats) = params.amount_sats {
            self.client
                .collaborative_redeem(&mut rng, destination, Amount::from_sat(amount_sats))
                .await?
        } else {
            let offchain = self.client.offchain_balance().await?;
            self.client
                .collaborative_redeem(&mut rng, destination, offchain.total())
                .await?
        };
        Ok(txid.to_string())
    }

    pub async fn collaborative_exit_fee_estimate(
        &self,
        destination_address: &str,
        amount_sats: Option<u64>,
    ) -> ArkResult<CollaborativeExitFeeEstimateDto> {
        let fees = self
            .client
            .server_info
            .fees
            .clone()
            .unwrap_or_else(empty_fee_info);
        let intent_fee_configured = map_intent_fee_configured(&fees.intent_fee);
        let destination = match parse_onchain_address(destination_address, self.network()) {
            Ok(address) => address,
            Err(error) => {
                return Ok(CollaborativeExitFeeEstimateDto {
                    tx_fee_rate: fees.tx_fee_rate.clone(),
                    intent_fee_configured,
                    estimated_total_fee_sats: None,
                    estimated_receive_sats: None,
                    estimate_error: Some(error.to_string()),
                });
            }
        };

        let to_amount = if let Some(amount_sats) = amount_sats {
            Amount::from_sat(amount_sats)
        } else {
            self.client.offchain_balance().await?.total()
        };

        let mut rng = OsRng;
        match self
            .client
            .estimate_onchain_fees(&mut rng, destination, to_amount)
            .await
        {
            Ok(estimate) => {
                let fee_sats = estimate.abs().to_sat() as u64;
                let receive = to_amount.to_sat().saturating_sub(fee_sats);
                Ok(CollaborativeExitFeeEstimateDto {
                    tx_fee_rate: fees.tx_fee_rate,
                    intent_fee_configured,
                    estimated_total_fee_sats: Some(fee_sats),
                    estimated_receive_sats: Some(receive),
                    estimate_error: None,
                })
            }
            Err(error) => Ok(CollaborativeExitFeeEstimateDto {
                tx_fee_rate: fees.tx_fee_rate,
                intent_fee_configured,
                estimated_total_fee_sats: None,
                estimated_receive_sats: None,
                estimate_error: Some(error.to_string()),
            }),
        }
    }

    pub async fn estimate_unilateral_exit(
        &self,
        params: UnilateralExitFeeParams,
    ) -> ArkResult<UnilateralExitFeeEstimateDto> {
        let outpoint = OutPoint {
            txid: params
                .txid
                .parse()
                .map_err(|error| ArkWasmError::Message(format!("invalid txid: {error}")))?,
            vout: params.vout,
        };

        let fee_rate = self.client.blockchain().get_fee_rate().await.unwrap_or(1.0);
        let fee_rate_sat_per_vb = fee_rate.max(1.0).ceil() as u64;
        let bumper_balance_sats = self.onchain_bumper_info().await?.balance_sats;

        let mut chain_tx_count = 0u32;
        let mut projected_unroll_steps = 0u32;
        let mut projected_wait_steps = 0u32;
        let mut estimate_error = None;

        match self.client.get_vtxo_chain(outpoint, 0, 0).await {
            Ok(Some(chain)) => {
                chain_tx_count = chain.chains.inner.len() as u32;
                projected_unroll_steps = chain_tx_count.saturating_sub(1);
                projected_wait_steps = chain
                    .chains
                    .inner
                    .iter()
                    .map(|link| link.spends.len())
                    .sum::<usize>() as u32;
            }
            Ok(None) => {
                estimate_error = Some("VTXO chain not found".to_string());
            }
            Err(error) => {
                estimate_error = Some(error.to_string());
            }
        }

        let estimated_package_fee_sats = if estimate_error.is_none() {
            let steps = projected_unroll_steps.max(1) as u64;
            steps * fee_rate_sat_per_vb * UNILATERAL_CHILD_VSIZE
        } else {
            0
        };

        Ok(UnilateralExitFeeEstimateDto {
            chain_tx_count,
            projected_unroll_steps,
            projected_wait_steps,
            fee_rate_sat_per_vb,
            estimated_package_fee_sats,
            bumper_balance_sats,
            bumper_sufficient: bumper_balance_sats >= estimated_package_fee_sats,
            estimate_error,
        })
    }

    pub async fn run_unilateral_unroll<F>(
        &self,
        txid: &str,
        vout: u32,
        on_progress: F,
    ) -> ArkResult<UnrollResult>
    where
        F: Fn(UnrollProgressEvent),
    {
        let target = OutPoint {
            txid: txid
                .parse()
                .map_err(|error| ArkWasmError::Message(format!("invalid txid: {error}")))?,
            vout,
        };

        let branch = self.build_unilateral_branch(target).await?;
        let mut done_vtxo_txid = txid.to_string();

        for parent_tx in branch {
            let parent_txid = parent_tx.compute_txid();
            let status = self
                .client
                .blockchain()
                .find_tx(&parent_txid)
                .await
                .map_err(|error| ArkWasmError::Message(error.to_string()))?;

            if status.is_none() {
                on_progress(UnrollProgressEvent {
                    event_type: "unroll".to_string(),
                    message: format!("Broadcasting unroll {parent_txid}"),
                    txid: Some(parent_txid.to_string()),
                    vtxo_txid: None,
                });

                if let Some(broadcast_txid) = self
                    .client
                    .broadcast_next_unilateral_exit_node(std::slice::from_ref(&parent_tx))
                    .await
                    .map_err(|error| ArkWasmError::Message(error.to_string()))?
                {
                    done_vtxo_txid = broadcast_txid.to_string();
                    on_progress(UnrollProgressEvent {
                        event_type: "wait".to_string(),
                        message: format!("Waiting for confirmation of {broadcast_txid}"),
                        txid: Some(broadcast_txid.to_string()),
                        vtxo_txid: None,
                    });
                }
            } else {
                on_progress(UnrollProgressEvent {
                    event_type: "wait".to_string(),
                    message: format!("Waiting for confirmation of {parent_txid}"),
                    txid: Some(parent_txid.to_string()),
                    vtxo_txid: None,
                });
            }
        }

        on_progress(UnrollProgressEvent {
            event_type: "done".to_string(),
            message: format!("Unroll complete for {done_vtxo_txid}"),
            txid: None,
            vtxo_txid: Some(done_vtxo_txid.clone()),
        });

        Ok(UnrollResult {
            vtxo_txid: done_vtxo_txid,
        })
    }

    pub async fn complete_unilateral_exit(
        &self,
        params: CompleteUnilateralExitParams,
    ) -> ArkResult<String> {
        if params.vtxo_txids.is_empty() {
            return Err(ArkWasmError::Message(
                "vtxo_txids must not be empty".to_string(),
            ));
        }

        let vtxo_txids: Vec<bitcoin::Txid> = params
            .vtxo_txids
            .iter()
            .map(|txid| {
                txid.parse()
                    .map_err(|error| ArkWasmError::Message(format!("invalid txid: {error}")))
            })
            .collect::<Result<_, _>>()?;

        let destination = parse_onchain_address(&params.destination_address, self.network())?;
        let txid = self
            .client
            .send_on_chain_for_vtxo_txids(destination, &vtxo_txids)
            .await?;
        Ok(txid.to_string())
    }

    async fn expiring_outpoints(&self) -> ArkResult<Vec<OutPoint>> {
        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let now = current_unix_timestamp();
        Ok(vtxo_list
            .all_unspent()
            .filter(|vtp| {
                if vtp.expires_at <= 0 || vtp.created_at <= 0 {
                    return false;
                }
                let total_lifetime = vtp.expires_at - vtp.created_at;
                let remaining = vtp.expires_at - now;
                remaining > 0
                    && (remaining as f64) < (total_lifetime as f64 * SELF_RENEW_REMAINING_FRACTION)
            })
            .map(|vtp| vtp.outpoint)
            .collect())
    }

    async fn build_unilateral_branch(
        &self,
        target: OutPoint,
    ) -> ArkResult<Vec<bitcoin::Transaction>> {
        let trees = self
            .client
            .build_unilateral_exit_trees()
            .await
            .map_err(|error| ArkWasmError::Message(error.to_string()))?;
        for branch in trees {
            if branch.first().is_some_and(|tx| {
                tx.input
                    .first()
                    .is_some_and(|input| input.previous_output == target)
            }) {
                return Ok(branch);
            }
        }
        Err(ArkWasmError::Message(
            "No unilateral exit branch found for VTXO".to_string(),
        ))
    }

    fn network(&self) -> Network {
        self.network_mode.to_bitcoin_network()
    }

    /// Re-scan derived Ark receive addresses against the operator indexer.
    ///
    /// Incoming VTXOs may land on indices that were not yet cached when the session opened.
    async fn sync_offchain_keys(&self) {
        if let Err(error) = self.client.discover_keys(DEFAULT_GAP_LIMIT).await {
            let _ = error;
        }
    }
}

fn parse_delegator_public_key(value: &str) -> ArkResult<PublicKey> {
    value
        .parse::<PublicKey>()
        .map_err(|error| ArkWasmError::Message(format!("invalid delegator pubkey: {error}")))
}

fn parse_onchain_address(value: &str, network: Network) -> ArkResult<Address> {
    Address::from_str(value)
        .map_err(|error| ArkWasmError::Message(error.to_string()))?
        .require_network(network)
        .map_err(|error| ArkWasmError::Message(error.to_string()))
}

fn map_intent_fee_configured(
    intent_fee: &ark_core::server::IntentFeeInfo,
) -> IntentFeeConfiguredDto {
    IntentFeeConfiguredDto {
        offchain_input: intent_fee
            .offchain_input
            .as_ref()
            .is_some_and(|v| !v.is_empty()),
        onchain_input: intent_fee
            .onchain_input
            .as_ref()
            .is_some_and(|v| !v.is_empty()),
        offchain_output: intent_fee
            .offchain_output
            .as_ref()
            .is_some_and(|v| !v.is_empty()),
        onchain_output: intent_fee
            .onchain_output
            .as_ref()
            .is_some_and(|v| !v.is_empty()),
    }
}

fn map_history_row(transaction: Transaction) -> Option<PaymentRowDto> {
    let timestamp = transaction.created_at().unwrap_or(0);
    match transaction {
        Transaction::Boarding { txid, amount, .. } => Some(PaymentRowDto {
            direction: "incoming".to_string(),
            amount_sats: amount.to_sat(),
            timestamp,
            txid: txid.to_string(),
            memo: None,
        }),
        Transaction::Commitment {
            txid,
            amount,
            created_at,
        } => {
            let signed = amount.to_sat();
            Some(PaymentRowDto {
                direction: if signed >= 0 {
                    "incoming".to_string()
                } else {
                    "outgoing".to_string()
                },
                amount_sats: signed.unsigned_abs(),
                timestamp: created_at,
                txid: txid.to_string(),
                memo: None,
            })
        }
        Transaction::Ark {
            txid,
            amount,
            created_at,
            ..
        } => {
            let signed = amount.to_sat();
            Some(PaymentRowDto {
                direction: if signed >= 0 {
                    "incoming".to_string()
                } else {
                    "outgoing".to_string()
                },
                amount_sats: signed.unsigned_abs(),
                timestamp: created_at,
                txid: txid.to_string(),
                memo: None,
            })
        }
        Transaction::Offboard {
            commitment_txid,
            amount,
            confirmed_at,
        } => Some(PaymentRowDto {
            direction: "outgoing".to_string(),
            amount_sats: amount.to_sat(),
            timestamp: confirmed_at.unwrap_or(0),
            txid: commitment_txid.to_string(),
            memo: None,
        }),
    }
}

fn map_exit_candidate(vtp: &VirtualTxOutPoint, dust: Amount) -> ExitCandidateRow {
    let recoverable = vtp.is_recoverable(dust);
    let state = if vtp.is_spent {
        "spent"
    } else if vtp.is_unrolled {
        "unrolled"
    } else if vtp.is_preconfirmed {
        "preconfirmed"
    } else if recoverable {
        "recoverable"
    } else {
        "settled"
    }
    .to_string();

    ExitCandidateRow {
        id: format!("{}:{}", vtp.outpoint.txid, vtp.outpoint.vout),
        txid: vtp.outpoint.txid.to_string(),
        vout: vtp.outpoint.vout,
        amount_sats: vtp.amount.to_sat(),
        virtual_status_state: state,
        is_recoverable: recoverable,
        is_unrolled: vtp.is_unrolled,
        can_start_unroll: recoverable && !vtp.is_unrolled && !vtp.is_spent,
        can_complete: vtp.is_unrolled && !vtp.is_spent,
    }
}

fn empty_fee_info() -> ark_core::server::FeeInfo {
    ark_core::server::FeeInfo {
        intent_fee: ark_core::server::IntentFeeInfo::default(),
        tx_fee_rate: "1".to_string(),
    }
}

fn wasm_safe_now() -> Duration {
    Duration::from_secs(current_unix_timestamp().max(0) as u64)
}

fn accumulate_boarding_utxo_balance(
    utxo: &ExplorerUtxo,
    boarding_output: &BoardingOutput,
    now: Duration,
    spendable_sats: &mut u64,
    pending_sats: &mut u64,
    expired_sats: &mut u64,
) {
    let amount_sats = utxo.amount.to_sat();
    match *utxo {
        ExplorerUtxo {
            confirmation_blocktime: Some(confirmation_blocktime),
            confirmations,
            is_spent: false,
            ..
        } => {
            if boarding_output.can_be_claimed_unilaterally_by_owner(
                now,
                Duration::from_secs(confirmation_blocktime),
                confirmations,
            ) {
                *expired_sats += amount_sats;
            } else {
                *spendable_sats += amount_sats;
            }
        }
        ExplorerUtxo {
            confirmation_blocktime: None,
            is_spent: false,
            ..
        } => {
            *pending_sats += amount_sats;
        }
        _ => {}
    }
}

fn current_unix_timestamp() -> i64 {
    #[cfg(target_arch = "wasm32")]
    {
        (js_sys::Date::now() / 1000.0) as i64
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock before UNIX epoch")
            .as_secs() as i64
    }
}
