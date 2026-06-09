use std::collections::HashSet;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use ark_bdk_wallet::Wallet as ArkBdkWallet;
use ark_client::key_provider::display_receive_derivation_index;
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
use bitcoin::{Address, Amount, Network, OutPoint, PublicKey, Txid, XOnlyPublicKey};

use crate::api_types::{
    BalanceDto, BoardingStatusDto, CollaborativeExitFeeEstimateDto, CollaborativeExitParams,
    CompleteUnilateralExitParams, DelegateInfoDto, DelegateSpendableResult, ExitCandidateRow,
    FinalizePendingResult, IntentFeeConfiguredDto, OnchainBumperInfoDto, PaymentRowDto,
    SendPaymentParams, UnilateralExitFeeEstimateDto, UnilateralExitFeeParams, UnrollProgressEvent,
    UnrollResult, VtxoExpiryStatusDto,
};
use crate::balance_display::{ArkadeBalanceInputs, build_arkade_balance_dto};
use crate::constants::{
    DEFAULT_TX_FEE_RATE, MIN_FEE_RATE_SAT_PER_VB, PAYMENT_DIRECTION_INCOMING,
    PAYMENT_DIRECTION_OUTGOING, UNROLL_EVENT_TYPE_DONE, UNROLL_EVENT_TYPE_UNROLL,
    UNROLL_EVENT_TYPE_WAIT, VTXO_STATUS_PRECONFIRMED, VTXO_STATUS_RECOVERABLE, VTXO_STATUS_SETTLED,
    VTXO_STATUS_SPENT, VTXO_STATUS_UNROLLED,
};
use crate::error::{ArkResult, ArkWasmError};
use crate::esplora_blockchain::EsploraBlockchain;
use crate::exit_balance::{
    gross_offchain_spendable_sats_from_snapshot, reconcile_pending_exit_deductions,
    sum_pending_exit_sats_by_kind, unilateral_exit_in_progress_sats_from_snapshot,
};
use crate::network::NetworkMode;
use crate::offchain_snapshot::{
    offchain_balance_sats_from_snapshot, offchain_history_from_snapshot,
    snapshot_from_virtual_tx_outpoints,
};
use crate::persistence::{
    BitboardArkPersistence, JsonPersistenceDb, OperatorIdentity, PendingExitDeductionRecord,
    PendingExitKind, SharedPersistenceDb, network_label, validate_operator_identity,
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
    operator_identity: OperatorIdentity,
}

impl ArkSession {
    pub async fn open(
        mnemonic_words: &str,
        network_mode: NetworkMode,
        ark_server_url: String,
        delegator_url: String,
        esplora_url: String,
        sdk_persistence_json: Option<&str>,
    ) -> ArkResult<Self> {
        let parsed = BitboardArkPersistence::parse_import(sdk_persistence_json);
        let offchain_next_derivation_index = parsed.wallet_db.offchain_next_derivation_index;
        let network = network_mode.to_bitcoin_network();

        let wallet_db = Arc::new(JsonPersistenceDb::from_snapshot(parsed.wallet_db));
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
            .map_err(|error| ArkWasmError::Wallet(error.to_string()))?,
        );

        // Always Bip32KeyProvider — never StaticKeyProvider/new_with_keypair — so ark-client
        // receive peek/reveal paths use the indexed branch, not the static fallback.
        let offline = OfflineClient::<
            EsploraBlockchain,
            ArkWallet,
            InMemorySwapStorage,
            Bip32KeyProvider,
        >::new_with_bip32_at_index(
            CLIENT_NAME.to_string(),
            xpriv,
            None,
            offchain_next_derivation_index,
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
        if offchain_next_derivation_index > 0 {
            let warm_through =
                display_receive_derivation_index(offchain_next_derivation_index).saturating_add(1);
            client.warm_offchain_receive_key_cache(warm_through)?;
        }
        let server_signer: XOnlyPublicKey = client.server_info.signer_pk.into();
        validate_operator_identity(parsed.operator_identity.as_ref(), server_signer, network)
            .map_err(ArkWasmError::Persistence)?;
        wallet_db.set_load_context(network, server_signer);
        client.sync_onchain_wallet().await?;

        let operator_identity = OperatorIdentity {
            signer_pk_hex: server_signer.to_string(),
            network: network_label(network),
        };

        Ok(Self {
            client,
            wallet_db,
            delegator,
            network_mode,
            operator_identity,
        })
    }

    pub fn export_persistence(&self) -> ArkResult<String> {
        let next_index = self.client.peek_next_offchain_derivation_index();
        self.wallet_db
            .set_offchain_next_derivation_index(next_index);
        let mut wallet_db = self.wallet_db.snapshot();
        wallet_db.offchain_next_derivation_index = next_index;
        let mut envelope = BitboardArkPersistence::empty(self.operator_identity.clone());
        envelope.wallet_db = wallet_db;
        Ok(serde_json::to_string(&envelope)?)
    }

    pub fn operator_signer_pk_hex(&self) -> String {
        self.operator_identity.signer_pk_hex.clone()
    }

    pub async fn sync_with_operator(&self) -> ArkResult<()> {
        self.sync_offchain_keys().await;
        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let all_points: Vec<VirtualTxOutPoint> = vtxo_list.all().cloned().collect();
        let snapshot = snapshot_from_virtual_tx_outpoints(
            self.client.server_info.dust.to_sat(),
            current_unix_timestamp(),
            all_points,
        );
        self.wallet_db.set_offchain_vtxo_snapshot(snapshot.clone());
        self.reconcile_pending_exit_deductions_with_snapshot(&snapshot)?;
        Ok(())
    }

    fn reconcile_pending_exit_deductions_with_snapshot(
        &self,
        snapshot: &crate::persistence::OffchainVtxoSnapshot,
    ) -> ArkResult<()> {
        let mut pending = self.wallet_db.pending_exit_deductions();
        reconcile_pending_exit_deductions(&mut pending, snapshot)?;
        self.wallet_db.set_pending_exit_deductions(pending);
        Ok(())
    }

    fn exit_balance_components(&self) -> ArkResult<(u64, u64)> {
        let pending = self.wallet_db.pending_exit_deductions();
        let snapshot_unilateral_sats = self
            .wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .as_ref()
            .map(unilateral_exit_in_progress_sats_from_snapshot)
            .transpose()?
            .unwrap_or(0);
        let pending_unilateral_sats =
            sum_pending_exit_sats_by_kind(&pending, PendingExitKind::Unilateral);
        let unilateral_exit_in_progress_sats =
            snapshot_unilateral_sats.saturating_add(pending_unilateral_sats);
        let collaborative_exit_in_progress_sats =
            sum_pending_exit_sats_by_kind(&pending, PendingExitKind::Collaborative);
        Ok((
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
        ))
    }

    async fn vtxo_amount_sats_for_outpoint(&self, txid: &str, vout: u32) -> ArkResult<u64> {
        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref() {
            for record in &snapshot.virtual_tx_outpoints {
                if record.txid == txid && record.vout == vout {
                    return Ok(record.amount_sats);
                }
            }
        }

        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let target_txid = parse_outpoint(txid, vout)?.txid;
        let amount = vtxo_list
            .all()
            .find(|virtual_tx_outpoint| {
                virtual_tx_outpoint.outpoint.txid == target_txid
                    && virtual_tx_outpoint.outpoint.vout == vout
            })
            .map(|virtual_tx_outpoint| virtual_tx_outpoint.amount.to_sat())
            .ok_or(ArkWasmError::VtxoNotFound {
                txid: txid.to_string(),
                vout,
            })?;
        Ok(amount)
    }

    fn record_pending_unilateral_exit(&self, txid: &str, vout: u32, amount_sats: u64) {
        self.wallet_db
            .upsert_pending_exit_deduction(PendingExitDeductionRecord {
                kind: PendingExitKind::Unilateral,
                vtxo_txid: Some(txid.to_string()),
                vout: Some(vout),
                amount_sats,
                started_at: current_unix_timestamp(),
                baseline_offchain_spendable_sats: None,
            });
    }

    fn record_pending_collaborative_exit(&self, amount_sats: u64, baseline_sats: u64) {
        self.wallet_db
            .upsert_pending_exit_deduction(PendingExitDeductionRecord {
                kind: PendingExitKind::Collaborative,
                vtxo_txid: None,
                vout: None,
                amount_sats,
                started_at: current_unix_timestamp(),
                baseline_offchain_spendable_sats: Some(baseline_sats),
            });
    }

    fn clear_pending_unilateral_exits_for_txids(&self, vtxo_txids: &[bitcoin::Txid]) {
        let txid_set: HashSet<String> = vtxo_txids.iter().map(|txid| txid.to_string()).collect();
        let mut pending = self.wallet_db.pending_exit_deductions();
        pending.retain(|record| {
            if record.kind != PendingExitKind::Unilateral {
                return true;
            }
            record
                .vtxo_txid
                .as_ref()
                .is_none_or(|txid| !txid_set.contains(txid))
        });
        self.wallet_db.set_pending_exit_deductions(pending);
    }

    pub fn peek_offchain_address(&self) -> ArkResult<String> {
        let (address, _) = self.client.peek_offchain_receive_address()?;
        Ok(address.to_string())
    }

    pub fn reveal_next_offchain_address(&self) -> ArkResult<String> {
        let (address, _) = self.client.reveal_next_offchain_receive_address()?;
        Ok(address.to_string())
    }

    pub async fn balance(&self) -> ArkResult<BalanceDto> {
        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() {
            self.reconcile_pending_exit_deductions_with_snapshot(&snapshot)?;
        }

        let (pre_confirmed_sats, confirmed_sats, recoverable_sats) =
            if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref() {
                offchain_balance_sats_from_snapshot(snapshot)?
            } else {
                (0, 0, 0)
            };
        let (unilateral_exit_in_progress_sats, collaborative_exit_in_progress_sats) =
            self.exit_balance_components()?;
        let onchain = self.client.onchain_wallet_balance()?;
        let boarding = self.boarding_status().await?;
        Ok(build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats,
            confirmed_offchain_sats: confirmed_sats,
            recoverable_sats,
            onchain_confirmed_sats: onchain.confirmed.to_sat(),
            boarding_spendable_sats: boarding.spendable_sats,
            boarding_pending_sats: boarding.pending_sats,
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
        }))
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

    pub async fn send_payment(&self, params: SendPaymentParams) -> ArkResult<String> {
        let address = ArkAddress::decode(&params.address)?;
        let amount = Amount::from_sat(params.amount_sats);
        let txid = self
            .client
            .send(vec![SendReceiver::bitcoin(address, amount)])
            .await?;
        Ok(txid.to_string())
    }

    pub async fn transaction_history(&self) -> ArkResult<Vec<PaymentRowDto>> {
        let boarding_commitment_transactions = self.boarding_commitment_txids().await?;
        let mut transactions = self.boarding_history_transactions().await?;

        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() {
            let mut offchain =
                offchain_history_from_snapshot(&snapshot, &boarding_commitment_transactions)?;
            transactions.append(&mut offchain);
        }

        ark_core::history::sort_transactions_by_created_at(&mut transactions);
        let rows = transactions
            .into_iter()
            .filter_map(map_history_row)
            .collect();
        Ok(rows)
    }

    pub async fn delegate_info(&self) -> ArkResult<DelegateInfoDto> {
        let delegator = self
            .delegator
            .as_ref()
            .ok_or(ArkWasmError::DelegatorNotConfigured)?;
        let info = delegator.info().await?;
        let fee = info
            .fee
            .parse::<u64>()
            .map_err(|error| ArkWasmError::InvalidDelegatorFee(error.to_string()))?;
        Ok(DelegateInfoDto {
            pubkey: info.pubkey,
            fee,
            delegator_address: info.delegator_address,
        })
    }

    pub async fn expiring_vtxo_count(&self) -> ArkResult<u32> {
        Ok(self.expiring_outpoints().await?.len() as u32)
    }

    pub async fn vtxo_expiry_status(&self) -> ArkResult<VtxoExpiryStatusDto> {
        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let now = current_unix_timestamp();
        let earliest_expires_at = vtxo_list
            .all_unspent()
            .filter(|virtual_tx_outpoint| {
                virtual_tx_outpoint.created_at > 0 && virtual_tx_outpoint.expires_at > now
            })
            .map(|virtual_tx_outpoint| virtual_tx_outpoint.expires_at)
            .min();
        let expiring_soon_count = self.expiring_vtxo_count().await?;
        Ok(VtxoExpiryStatusDto {
            earliest_expires_at,
            expiring_soon_count,
        })
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
                error_message: None,
            });
        };

        let delegator_info = delegator.info().await?;
        let delegator_pubkey = parse_delegator_public_key(&delegator_info.pubkey)?;
        let mut delegated = 0u32;
        let mut failed = 0u32;
        let mut error_message = None;

        let cosigner_pk = delegator_pubkey.inner;
        match self.client.generate_delegate(cosigner_pk).await {
            Ok(mut delegate) => {
                if let Err(error) = self
                    .client
                    .sign_delegate_psbts(&mut delegate.intent.proof, &mut delegate.forfeit_psbts)
                {
                    failed = 1;
                    error_message = Some(format!("sign delegate PSBTs: {error}"));
                } else if let Err(error) = delegator
                    .delegate(&delegate.intent, &delegate.forfeit_psbts, None)
                    .await
                {
                    failed = 1;
                    error_message = Some(format!("delegator RPC: {error}"));
                } else {
                    delegated = delegate.forfeit_psbts.len() as u32;
                }
            }
            Err(error) => {
                failed = 1;
                error_message = Some(format!("generate delegate: {error}"));
            }
        }

        Ok(DelegateSpendableResult {
            delegated,
            failed,
            error_message,
        })
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
                return Err(ArkWasmError::Boarding(
                    "Boarding payment is unconfirmed. Wait for at least one block confirmation, then try again.".to_string(),
                ));
            }
            if status.expired_sats > 0 {
                return Err(ArkWasmError::Boarding(
                    "Boarding UTXO can only be spent unilaterally now. Use the unilateral exit flow instead of settle.".to_string(),
                ));
            }
            if status.tracked_addresses.is_empty() {
                return Err(ArkWasmError::Boarding(
                    "No boarding address is registered for this wallet session.".to_string(),
                ));
            }
            return Err(ArkWasmError::Boarding(format!(
                "No spendable boarding UTXO found at {}. Confirm the payment was sent to that exact address on {}.",
                status.boarding_address,
                self.network_mode.label(),
            )));
        }

        let mut rng = OsRng;
        match self.client.settle(&mut rng).await {
            Ok(Some(txid)) => Ok(Some(txid.to_string())),
            Ok(None) => Err(ArkWasmError::Boarding(
                "Settle returned no inputs even though boarding UTXOs looked spendable. Try again in a moment.".to_string(),
            )),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn list_exit_candidates(&self) -> ArkResult<Vec<ExitCandidateRow>> {
        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let dust = self.client.server_info.dust;
        let rows = vtxo_list
            .all()
            .map(|virtual_tx_outpoint| map_exit_candidate(virtual_tx_outpoint, dust))
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
        let baseline_offchain_spendable_sats = self
            .wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .as_ref()
            .map(gross_offchain_spendable_sats_from_snapshot)
            .transpose()?
            .unwrap_or(0);
        let mut rng = OsRng;
        let (txid, exit_amount_sats) = if let Some(amount_sats) = params.amount_sats {
            let txid = self
                .client
                .collaborative_redeem(&mut rng, destination, Amount::from_sat(amount_sats))
                .await?;
            (txid, amount_sats)
        } else {
            let offchain = self.client.offchain_balance().await?;
            let exit_total = offchain.total();
            let txid = self
                .client
                .collaborative_redeem(&mut rng, destination, exit_total)
                .await?;
            (txid, exit_total.to_sat())
        };
        self.record_pending_collaborative_exit(exit_amount_sats, baseline_offchain_spendable_sats);
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
        let outpoint = parse_outpoint(&params.txid, params.vout)?;

        let fee_rate = self
            .client
            .blockchain()
            .get_fee_rate()
            .await
            .unwrap_or(MIN_FEE_RATE_SAT_PER_VB);
        let fee_rate_sat_per_vb = fee_rate.max(MIN_FEE_RATE_SAT_PER_VB);
        let bumper_balance_sats = self.onchain_bumper_info().await?.balance_sats;

        let mut chain_tx_count = 0u32;
        let mut projected_unroll_steps = 0u32;
        let mut projected_wait_steps = 0u32;
        let mut estimate_error = None;

        match self.client.get_vtxo_chain(outpoint, None).await {
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
            (steps as f64 * fee_rate_sat_per_vb * UNILATERAL_CHILD_VSIZE as f64).ceil() as u64
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
        let target = parse_outpoint(txid, vout)?;

        let amount_sats = self.vtxo_amount_sats_for_outpoint(txid, vout).await?;
        let mut pending_unilateral_exit_recorded = false;

        let branch = self.build_unilateral_branch(target).await?;
        let mut done_vtxo_txid = txid.to_string();

        for parent_tx in branch {
            let parent_txid = parent_tx.compute_txid();
            let status = self.client.blockchain().find_tx(&parent_txid).await?;

            if status.is_none() {
                on_progress(UnrollProgressEvent {
                    event_type: UNROLL_EVENT_TYPE_UNROLL.to_string(),
                    message: format!("Broadcasting unroll {parent_txid}"),
                    txid: Some(parent_txid.to_string()),
                    vtxo_txid: None,
                });

                let broadcast_txid = self
                    .client
                    .broadcast_next_unilateral_exit_node(std::slice::from_ref(&parent_tx))
                    .await?;
                if !pending_unilateral_exit_recorded {
                    self.record_pending_unilateral_exit(txid, vout, amount_sats);
                    pending_unilateral_exit_recorded = true;
                }
                if let Some(broadcast_txid) = broadcast_txid {
                    done_vtxo_txid = broadcast_txid.to_string();
                    on_progress(UnrollProgressEvent {
                        event_type: UNROLL_EVENT_TYPE_WAIT.to_string(),
                        message: format!("Waiting for confirmation of {broadcast_txid}"),
                        txid: Some(broadcast_txid.to_string()),
                        vtxo_txid: None,
                    });
                }
            } else {
                if !pending_unilateral_exit_recorded {
                    self.record_pending_unilateral_exit(txid, vout, amount_sats);
                    pending_unilateral_exit_recorded = true;
                }
                on_progress(UnrollProgressEvent {
                    event_type: UNROLL_EVENT_TYPE_WAIT.to_string(),
                    message: format!("Waiting for confirmation of {parent_txid}"),
                    txid: Some(parent_txid.to_string()),
                    vtxo_txid: None,
                });
            }
        }

        on_progress(UnrollProgressEvent {
            event_type: UNROLL_EVENT_TYPE_DONE.to_string(),
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
            return Err(ArkWasmError::EmptyVtxoTxids);
        }

        let vtxo_txids: Vec<bitcoin::Txid> = params
            .vtxo_txids
            .iter()
            .map(|txid| {
                Txid::from_str(txid).map_err(|error| ArkWasmError::InvalidTxid(error.to_string()))
            })
            .collect::<Result<_, _>>()?;

        let destination = parse_onchain_address(&params.destination_address, self.network())?;
        let txid = self
            .client
            .send_on_chain_for_vtxo_txids(destination, &vtxo_txids)
            .await?;
        self.clear_pending_unilateral_exits_for_txids(&vtxo_txids);
        Ok(txid.to_string())
    }

    async fn expiring_outpoints(&self) -> ArkResult<Vec<OutPoint>> {
        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let now = current_unix_timestamp();
        Ok(vtxo_list
            .all_unspent()
            .filter(|virtual_tx_outpoint| {
                if virtual_tx_outpoint.expires_at <= 0 || virtual_tx_outpoint.created_at <= 0 {
                    return false;
                }
                let total_lifetime =
                    virtual_tx_outpoint.expires_at - virtual_tx_outpoint.created_at;
                let remaining = virtual_tx_outpoint.expires_at - now;
                remaining > 0
                    && (remaining as f64) < (total_lifetime as f64 * SELF_RENEW_REMAINING_FRACTION)
            })
            .map(|virtual_tx_outpoint| virtual_tx_outpoint.outpoint)
            .collect())
    }

    async fn build_unilateral_branch(
        &self,
        target: OutPoint,
    ) -> ArkResult<Vec<bitcoin::Transaction>> {
        self.client
            .build_unilateral_exit_branch(target)
            .await
            .map_err(Into::into)
    }

    fn network(&self) -> Network {
        self.network_mode.to_bitcoin_network()
    }

    async fn boarding_commitment_txids(&self) -> ArkResult<Vec<bitcoin::Txid>> {
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

    async fn boarding_history_transactions(&self) -> ArkResult<Vec<Transaction>> {
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

    /// Re-scan derived Ark receive addresses against the operator indexer.
    ///
    /// Incoming VTXOs may land on indices that were not yet cached when the session opened.
    /// Discovery failures are logged but do not fail balance/history calls — stale cache is
    /// preferable to breaking dashboard polling on transient operator/network errors.
    async fn sync_offchain_keys(&self) {
        if let Err(error) = self.client.discover_keys(DEFAULT_GAP_LIMIT).await {
            warn_offchain_key_discovery_failed(&error);
        }
    }
}

fn warn_offchain_key_discovery_failed(error: &ark_client::Error) {
    let message = format!("Arkade offchain key discovery failed: {error}");
    #[cfg(target_arch = "wasm32")]
    web_sys::console::warn_1(&message.into());
    #[cfg(not(target_arch = "wasm32"))]
    eprintln!("{message}");
}

fn parse_delegator_public_key(value: &str) -> ArkResult<PublicKey> {
    value
        .parse::<PublicKey>()
        .map_err(|error| ArkWasmError::InvalidDelegatorPubkey(error.to_string()))
}

fn parse_onchain_address(value: &str, network: Network) -> ArkResult<Address> {
    Address::from_str(value)
        .map_err(|error| ArkWasmError::InvalidOnchainAddress(error.to_string()))?
        .require_network(network)
        .map_err(|error| ArkWasmError::InvalidOnchainAddress(error.to_string()))
}

fn parse_outpoint(txid: &str, vout: u32) -> ArkResult<OutPoint> {
    let txid =
        Txid::from_str(txid).map_err(|error| ArkWasmError::InvalidTxid(error.to_string()))?;
    Ok(OutPoint { txid, vout })
}

fn payment_direction_and_amount_sats(signed_amount_sats: i64) -> (&'static str, u64) {
    if signed_amount_sats >= 0 {
        (PAYMENT_DIRECTION_INCOMING, signed_amount_sats as u64)
    } else {
        (
            PAYMENT_DIRECTION_OUTGOING,
            signed_amount_sats.unsigned_abs(),
        )
    }
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
            direction: PAYMENT_DIRECTION_INCOMING.to_string(),
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
            let (direction, amount_sats) = payment_direction_and_amount_sats(amount.to_sat());
            Some(PaymentRowDto {
                direction: direction.to_string(),
                amount_sats,
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
            let (direction, amount_sats) = payment_direction_and_amount_sats(amount.to_sat());
            Some(PaymentRowDto {
                direction: direction.to_string(),
                amount_sats,
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
            direction: PAYMENT_DIRECTION_OUTGOING.to_string(),
            amount_sats: amount.to_sat(),
            timestamp: confirmed_at.unwrap_or(0),
            txid: commitment_txid.to_string(),
            memo: None,
        }),
    }
}

fn map_exit_candidate(virtual_tx_outpoint: &VirtualTxOutPoint, dust: Amount) -> ExitCandidateRow {
    let recoverable = virtual_tx_outpoint.is_recoverable(dust);
    let state = if virtual_tx_outpoint.is_spent {
        VTXO_STATUS_SPENT
    } else if virtual_tx_outpoint.is_unrolled {
        VTXO_STATUS_UNROLLED
    } else if virtual_tx_outpoint.is_preconfirmed {
        VTXO_STATUS_PRECONFIRMED
    } else if recoverable {
        VTXO_STATUS_RECOVERABLE
    } else {
        VTXO_STATUS_SETTLED
    }
    .to_string();

    ExitCandidateRow {
        id: format!(
            "{}:{}",
            virtual_tx_outpoint.outpoint.txid, virtual_tx_outpoint.outpoint.vout
        ),
        txid: virtual_tx_outpoint.outpoint.txid.to_string(),
        vout: virtual_tx_outpoint.outpoint.vout,
        amount_sats: virtual_tx_outpoint.amount.to_sat(),
        virtual_status_state: state,
        is_recoverable: recoverable,
        is_unrolled: virtual_tx_outpoint.is_unrolled,
        // Match ark_client::could_exit_unilaterally(): active confirmed/preconfirmed VTXOs, not
        // recoverable (expired/swept/sub-dust) ones that use a different settlement path.
        can_start_unroll: !recoverable
            && !virtual_tx_outpoint.is_unrolled
            && !virtual_tx_outpoint.is_spent
            && !virtual_tx_outpoint.is_swept,
        can_complete: virtual_tx_outpoint.is_unrolled && !virtual_tx_outpoint.is_spent,
    }
}

fn empty_fee_info() -> ark_core::server::FeeInfo {
    ark_core::server::FeeInfo {
        intent_fee: ark_core::server::IntentFeeInfo::default(),
        tx_fee_rate: DEFAULT_TX_FEE_RATE.to_string(),
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
        } if confirmations >= 1 => {
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
            is_spent: false, ..
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

#[cfg(test)]
mod exit_candidate_tests {
    use super::{current_unix_timestamp, map_exit_candidate};
    use crate::constants::{VTXO_STATUS_RECOVERABLE, VTXO_STATUS_SETTLED};
    use ark_core::server::VirtualTxOutPoint;
    use bitcoin::Amount;
    use bitcoin::OutPoint;
    use bitcoin::ScriptBuf;
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;

    const DUST: Amount = Amount::from_sat(330);

    fn sample_vtp(expires_at: i64, flags: VtpFlags) -> VirtualTxOutPoint {
        VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::all_zeros(), 0),
            created_at: expires_at - 86_400,
            expires_at,
            amount: Amount::from_sat(180_603),
            script: ScriptBuf::new(),
            is_preconfirmed: flags.is_preconfirmed,
            is_swept: flags.is_swept,
            is_unrolled: flags.is_unrolled,
            is_spent: flags.is_spent,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        }
    }

    struct VtpFlags {
        is_preconfirmed: bool,
        is_swept: bool,
        is_unrolled: bool,
        is_spent: bool,
    }

    #[test]
    fn settled_vtxo_can_start_unroll() {
        let future_expiry = current_unix_timestamp() + 86_400;
        let row = map_exit_candidate(
            &sample_vtp(
                future_expiry,
                VtpFlags {
                    is_preconfirmed: false,
                    is_swept: false,
                    is_unrolled: false,
                    is_spent: false,
                },
            ),
            DUST,
        );

        assert_eq!(row.virtual_status_state, VTXO_STATUS_SETTLED);
        assert!(row.can_start_unroll);
        assert!(!row.can_complete);
    }

    #[test]
    fn expired_recoverable_vtxo_cannot_start_unroll() {
        let past_expiry = current_unix_timestamp() - 86_400;
        let row = map_exit_candidate(
            &sample_vtp(
                past_expiry,
                VtpFlags {
                    is_preconfirmed: false,
                    is_swept: false,
                    is_unrolled: false,
                    is_spent: false,
                },
            ),
            DUST,
        );

        assert_eq!(row.virtual_status_state, VTXO_STATUS_RECOVERABLE);
        assert!(!row.can_start_unroll);
        assert!(!row.can_complete);
    }

    #[test]
    fn unrolled_vtxo_can_complete_but_not_start_unroll() {
        let future_expiry = current_unix_timestamp() + 86_400;
        let row = map_exit_candidate(
            &sample_vtp(
                future_expiry,
                VtpFlags {
                    is_preconfirmed: false,
                    is_swept: false,
                    is_unrolled: true,
                    is_spent: false,
                },
            ),
            DUST,
        );

        assert_eq!(row.virtual_status_state, "unrolled");
        assert!(!row.can_start_unroll);
        assert!(row.can_complete);
    }
}

#[cfg(test)]
mod boarding_utxo_balance_tests {
    use super::accumulate_boarding_utxo_balance;
    use ark_core::BoardingOutput;
    use ark_core::ExplorerUtxo;
    use bitcoin::Amount;
    use bitcoin::OutPoint;
    use bitcoin::Sequence;
    use bitcoin::Txid;
    use bitcoin::XOnlyPublicKey;
    use bitcoin::key::Secp256k1;
    use std::str::FromStr;
    use std::time::Duration;

    fn sample_boarding_output() -> BoardingOutput {
        let secp = Secp256k1::new();
        let server = XOnlyPublicKey::from_str(
            "18845781f631c48f1c9709e23092067d06837f30aa0cd0544ac887fe91ddd166",
        )
        .expect("valid server key");
        let owner = XOnlyPublicKey::from_str(
            "28845781f631c48f1c9709e23092067d06837f30aa0cd0544ac887fe91ddd166",
        )
        .expect("valid owner key");
        BoardingOutput::new(
            &secp,
            server,
            owner,
            Sequence::from_consensus(144),
            bitcoin::Network::Signet,
        )
        .expect("valid boarding output")
    }

    fn sample_utxo(confirmation_blocktime: Option<u64>, confirmations: u64) -> ExplorerUtxo {
        ExplorerUtxo {
            outpoint: OutPoint {
                txid: Txid::from_str(
                    "0000000000000000000000000000000000000000000000000000000000000001",
                )
                .expect("valid txid"),
                vout: 0,
            },
            amount: Amount::from_sat(50_000),
            confirmation_blocktime,
            confirmations,
            is_spent: false,
        }
    }

    #[test]
    fn zero_confirmation_boarding_utxo_counts_as_pending_even_with_blocktime() {
        let boarding_output = sample_boarding_output();
        let mut spendable_sats = 0;
        let mut pending_sats = 0;
        let mut expired_sats = 0;

        accumulate_boarding_utxo_balance(
            &sample_utxo(Some(1_700_000_000), 0),
            &boarding_output,
            Duration::from_secs(1_700_000_100),
            &mut spendable_sats,
            &mut pending_sats,
            &mut expired_sats,
        );

        assert_eq!(spendable_sats, 0);
        assert_eq!(pending_sats, 50_000);
        assert_eq!(expired_sats, 0);
    }

    #[test]
    fn confirmed_boarding_utxo_counts_as_spendable() {
        let boarding_output = sample_boarding_output();
        let mut spendable_sats = 0;
        let mut pending_sats = 0;
        let mut expired_sats = 0;

        accumulate_boarding_utxo_balance(
            &sample_utxo(Some(1_700_000_000), 1),
            &boarding_output,
            Duration::from_secs(1_700_000_100),
            &mut spendable_sats,
            &mut pending_sats,
            &mut expired_sats,
        );

        assert_eq!(spendable_sats, 50_000);
        assert_eq!(pending_sats, 0);
        assert_eq!(expired_sats, 0);
    }
}
