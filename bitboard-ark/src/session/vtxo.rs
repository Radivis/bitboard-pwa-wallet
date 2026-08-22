use std::collections::HashSet;

use ark_client::{Blockchain, JoinBatchOutcome};
use ark_core::VtxoList;
use ark_core::server::VirtualTxOutPoint;
use bitcoin::{Amount, OutPoint, ScriptBuf, Txid, XOnlyPublicKey, secp256k1::rand::rngs::OsRng};

use crate::api_types::{
    BatchJoinResultDto, DelegateSpendableResult, FinalizePendingResult,
    RecoverableVtxoFeeEstimateDto, VtxoClassificationDto, VtxoExpiryStatusDto, VtxoListResultDto,
    VtxoRowDto,
};
use crate::constants::VTXO_SELF_RENEW_REMAINING_FRACTION;
use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::{
    UnilateralExitOutpointKey, unilateral_exit_in_progress_outpoints_from_pending,
};
use crate::offchain_snapshot::{
    apply_local_snapshot_flags_to_vtxo, local_snapshot_record_for_outpoint,
    script_to_server_pk_lookup, vtxo_list_from_snapshot,
};
use crate::outpoint::OnchainOutPoint;
use crate::persistence::{
    OffchainVtxoSnapshot, PendingBatchIntentKind, PendingBatchOutpointRecord,
};
use crate::unilateral_exit_materials::virtual_tx_outpoint_has_unilateral_exit_prepared;

use super::ArkSession;
use super::autonomous::balance_vtxo_reads_use_operator_rpc;
use super::mappers::{
    current_unix_timestamp, empty_fee_info, map_intent_fee_configured, parse_delegator_public_key,
};
use super::offchain_balance::legacy_signer_pk_fallback;

/// Recoverable VTXO outpoints and aggregate amount for one balance bucket.
pub(crate) struct RecoverableVtxoSummary {
    pub outpoints: Vec<OutPoint>,
    pub total_sats: u64,
    pub count: u32,
}

/// Settleable recoverable VTXOs vs client-expired VTXOs still awaiting operator sweep.
pub(crate) struct RecoverableVtxoBuckets {
    /// Swept or sub-dust VTXOs the user can batch-settle now (`is_swept || amount < dust`).
    pub settleable: RecoverableVtxoSummary,
    /// Client-expired VTXOs not yet swept by the operator (`is_expired && !is_swept && amount >= dust`).
    pub pending_operator_sweep: RecoverableVtxoSummary,
}

/// Recovery settles every currently-recoverable VTXO in one round, but the operator's rolling sweep
/// can mark *additional* VTXOs recoverable just after we snapshot the set (e.g. a VTXO whose tree
/// expiry the chain only just passed). We therefore re-snapshot and re-settle until nothing remains
/// recoverable, bounded so a VTXO the operator refuses to settle cannot spin us forever.
const RECOVER_RECOVERABLE_MAX_ROUNDS: u8 = 5;

/// arkd broadcasts the commitment TX before emitting its TXID over the event stream, but our own
/// blockchain backend can lag a moment behind. We poll for the TX this many times (with a short
/// delay) before concluding the boarding input was skipped, so propagation lag is not mistaken for
/// an operator skip.
const COMMITMENT_TX_VISIBILITY_MAX_POLLS: u8 = 10;
const COMMITMENT_TX_VISIBILITY_POLL_DELAY: std::time::Duration =
    std::time::Duration::from_millis(500);

#[cfg(target_arch = "wasm32")]
async fn sleep(duration: std::time::Duration) {
    bitboard_wasm_sleep::sleep_for(duration).await;
}

#[cfg(not(target_arch = "wasm32"))]
async fn sleep(duration: std::time::Duration) {
    tokio::time::sleep(duration).await;
}

impl ArkSession {
    /// Recoverable sub-buckets for balance, fee estimate, and batch recover.
    ///
    /// Excludes pre-unroll unilateral pending outpoints only — post-unroll exiting VTXOs are kept
    /// out of recoverable by vendored ark-core bucketing. See `docs/arkade-bitboard-wallet-model.md`.
    pub(crate) async fn recoverable_vtxo_buckets(&self) -> ArkResult<RecoverableVtxoBuckets> {
        let dust = self.client.server_info()?.dust;
        let exclude_pre_unroll_unilateral_exit = unilateral_exit_in_progress_outpoints_from_pending(
            &self.wallet_db.pending_exit_deductions(),
        );

        if balance_vtxo_reads_use_operator_rpc(self.autonomous_mode())
            && let Ok((vtxo_list, _)) = self.client.list_vtxos().await
        {
            return Ok(recoverable_vtxo_buckets_from_list(
                &vtxo_list,
                dust,
                &exclude_pre_unroll_unilateral_exit,
            ));
        }

        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref() {
            let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
            return Ok(recoverable_vtxo_buckets_from_list(
                &vtxo_list,
                dust,
                &exclude_pre_unroll_unilateral_exit,
            ));
        }

        Ok(empty_recoverable_vtxo_buckets())
    }

    pub async fn recoverable_vtxo_fee_estimate(&self) -> ArkResult<RecoverableVtxoFeeEstimateDto> {
        self.ensure_operator_rpc_allowed()?;
        let fees = self
            .client
            .server_info()?
            .fees
            .clone()
            .unwrap_or_else(empty_fee_info);
        let intent_fee_configured = map_intent_fee_configured(&fees.intent_fee);
        let summary = self.recoverable_vtxo_buckets().await?.settleable;

        if summary.count == 0 {
            return Ok(RecoverableVtxoFeeEstimateDto {
                recoverable_vtxo_count: 0,
                recoverable_total_sats: 0,
                tx_fee_rate: fees.tx_fee_rate,
                intent_fee_configured,
                estimated_total_fee_sats: None,
                estimated_receive_sats: None,
                estimate_error: None,
            });
        }

        let (to_address, _) = self.client.get_offchain_address()?;
        let mut rng = OsRng;
        match self
            .client
            .estimate_batch_fees_vtxo_selection(
                &mut rng,
                summary.outpoints.iter().copied(),
                to_address,
            )
            .await
        {
            Ok(estimate) => {
                let fee_sats = estimate.abs().to_sat() as u64;
                let receive = summary.total_sats.saturating_sub(fee_sats);
                Ok(RecoverableVtxoFeeEstimateDto {
                    recoverable_vtxo_count: summary.count,
                    recoverable_total_sats: summary.total_sats,
                    tx_fee_rate: fees.tx_fee_rate,
                    intent_fee_configured,
                    estimated_total_fee_sats: Some(fee_sats),
                    estimated_receive_sats: Some(receive),
                    estimate_error: None,
                })
            }
            Err(error) => Ok(RecoverableVtxoFeeEstimateDto {
                recoverable_vtxo_count: summary.count,
                recoverable_total_sats: summary.total_sats,
                tx_fee_rate: fees.tx_fee_rate,
                intent_fee_configured,
                estimated_total_fee_sats: None,
                estimated_receive_sats: None,
                estimate_error: Some(error.to_string()),
            }),
        }
    }

    pub async fn recover_recoverable_vtxos(&self) -> ArkResult<BatchJoinResultDto> {
        self.ensure_operator_rpc_allowed()?;
        let mut last_completed: Option<bitcoin::Txid> = None;

        for _ in 0..RECOVER_RECOVERABLE_MAX_ROUNDS {
            let summary = self.recoverable_vtxo_buckets().await?.settleable;
            if summary.outpoints.is_empty() {
                break;
            }
            if let Some(waiting) = self
                .existing_pending_batch_join_result(&[], &summary.outpoints)
                .await?
            {
                return Ok(waiting);
            }

            let mut rng = OsRng;
            let settle = self
                .with_batch_join(
                    PendingBatchIntentKind::Recover,
                    summary.total_sats,
                    None,
                    || async {
                        self.client
                            .settle_vtxos(&mut rng, &summary.outpoints, &[])
                            .await
                    },
                )
                .await;
            match settle {
                Ok(Some(JoinBatchOutcome::Completed(commitment_txid))) => {
                    last_completed = Some(commitment_txid);
                    self.sync_with_operator().await?;
                }
                Ok(Some(JoinBatchOutcome::Waiting(intent))) => {
                    return Ok(self.batch_join_waiting_result(
                        PendingBatchIntentKind::Recover,
                        &intent,
                        summary.total_sats,
                    ));
                }
                Ok(None) => break,
                Err(error) => {
                    return self
                        .map_settle_error(
                            PendingBatchIntentKind::Recover,
                            error,
                            &[],
                            &summary.outpoints,
                            summary.total_sats,
                        )
                        .await;
                }
            }
        }

        Ok(match last_completed {
            Some(txid) => Self::batch_join_completed_result(txid),
            None => BatchJoinResultDto {
                status: crate::api_types::BATCH_JOIN_STATUS_COMPLETED.to_string(),
                commitment_txid: None,
                pending_intent: None,
            },
        })
    }

    pub async fn expiring_vtxo_count(&self) -> ArkResult<u32> {
        Ok(self.expiring_outpoints().await?.len() as u32)
    }

    pub async fn list_vtxos(&self) -> ArkResult<VtxoListResultDto> {
        let dust = self.client.server_info()?.dust;
        let server_info = self.client.server_info()?;
        let now = current_unix_timestamp();

        if !self.autonomous_mode()
            && let Ok((vtxo_list, script_map)) = self.client.list_vtxos().await
        {
            let wallet_snapshot = self.wallet_db.snapshot();
            let offchain_snapshot = wallet_snapshot.offchain_vtxo_snapshot.as_ref();
            let rows = map_vtxo_rows_from_list(
                &vtxo_list,
                dust,
                &server_info,
                now,
                |script| script_map.get(script).map(|vtxo| vtxo.server_pk()),
                offchain_snapshot,
            );
            return Ok(VtxoListResultDto {
                rows,
                from_snapshot_synced_at: None,
            });
        }

        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref() {
            let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
            let script_lookup = script_to_server_pk_lookup(
                snapshot,
                legacy_signer_pk_fallback(&self.persisted_operator_identity()),
            )?;
            let rows = map_vtxo_rows_from_list(
                &vtxo_list,
                dust,
                &server_info,
                now,
                |script| script_lookup(script),
                Some(snapshot),
            );
            return Ok(VtxoListResultDto {
                rows,
                from_snapshot_synced_at: Some(snapshot.synced_at),
            });
        }

        Ok(VtxoListResultDto {
            rows: Vec::new(),
            from_snapshot_synced_at: None,
        })
    }

    pub async fn vtxo_expiry_status(&self) -> ArkResult<VtxoExpiryStatusDto> {
        let (vtxo_list, _) = if self.autonomous_mode() {
            self.snapshot_vtxo_list_and_script_map()?
        } else {
            self.client.list_vtxos().await?
        };
        let exclude_pre_unroll_unilateral_exit = unilateral_exit_in_progress_outpoints_from_pending(
            &self.wallet_db.pending_exit_deductions(),
        );
        let now = current_unix_timestamp();
        let earliest_expires_at = vtxo_list
            .all_unspent()
            .filter(|virtual_tx_outpoint| {
                !exclude_pre_unroll_unilateral_exit.contains(&virtual_tx_outpoint.outpoint)
                    && virtual_tx_outpoint.created_at > 0
                    && virtual_tx_outpoint.expires_at > now
            })
            .map(|virtual_tx_outpoint| virtual_tx_outpoint.expires_at)
            .min();
        let expiring_soon_count = self.expiring_vtxo_count().await?;
        Ok(VtxoExpiryStatusDto {
            earliest_expires_at,
            expiring_soon_count,
        })
    }

    pub async fn renew_vtxos_now(&self) -> ArkResult<BatchJoinResultDto> {
        self.ensure_operator_rpc_allowed()?;
        let expiring = self.expiring_outpoints().await?;
        if let Some(waiting) = self
            .existing_pending_batch_join_result(&[], &expiring)
            .await?
        {
            return Ok(waiting);
        }
        if expiring.is_empty() {
            return Ok(BatchJoinResultDto {
                status: crate::api_types::BATCH_JOIN_STATUS_COMPLETED.to_string(),
                commitment_txid: None,
                pending_intent: None,
            });
        }
        let amount_sats = self
            .wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .as_ref()
            .map(|snapshot| {
                snapshot
                    .virtual_tx_outpoints
                    .iter()
                    .filter(|row| {
                        expiring.iter().any(|outpoint| {
                            row.txid == outpoint.txid.to_string() && row.vout == outpoint.vout
                        })
                    })
                    .map(|row| row.amount_sats)
                    .sum()
            })
            .unwrap_or(0);
        let mut rng = OsRng;
        let settle = self
            .with_batch_join(PendingBatchIntentKind::Renew, amount_sats, None, || async {
                self.client.settle_vtxos(&mut rng, &expiring, &[]).await
            })
            .await;
        match settle {
            Ok(Some(outcome)) => {
                self.map_settle_outcome(
                    PendingBatchIntentKind::Renew,
                    outcome,
                    &[],
                    &expiring,
                    amount_sats,
                )
                .await
            }
            Ok(None) => Ok(BatchJoinResultDto {
                status: crate::api_types::BATCH_JOIN_STATUS_COMPLETED.to_string(),
                commitment_txid: None,
                pending_intent: None,
            }),
            Err(error) => {
                self.map_settle_error(
                    PendingBatchIntentKind::Renew,
                    error,
                    &[],
                    &expiring,
                    amount_sats,
                )
                .await
            }
        }
    }

    pub async fn delegate_spendable_vtxos(&self) -> ArkResult<DelegateSpendableResult> {
        self.ensure_operator_rpc_allowed()?;
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
        self.ensure_operator_rpc_allowed()?;
        let pending_before = self.client.list_pending_offchain_txs().await?.len();
        let finalized = self.client.continue_pending_offchain_txs().await?;
        let pending_after = self.client.list_pending_offchain_txs().await?.len();
        Ok(FinalizePendingResult {
            finalized: finalized.len() as u32,
            pending: pending_after.max(pending_before.saturating_sub(finalized.len())) as u32,
        })
    }

    pub async fn onboard_boarded_utxos(&self) -> ArkResult<BatchJoinResultDto> {
        self.ensure_operator_rpc_allowed()?;
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
        let boarding_outpoint = self
            .newest_cooperative_boarding_outpoint()
            .await?
            .ok_or_else(|| {
                ArkWasmError::Boarding(
                    "No boarding UTXO is inside the operator cooperative settle window. \
                     Fund the boarding address and settle within ~30 seconds of confirmation."
                        .to_string(),
                )
            })?;
        let amount_sats = status.spendable_sats;
        let onchain = [boarding_outpoint.inner()];
        if let Some(waiting) = self
            .existing_pending_batch_join_result(&onchain, &[])
            .await?
        {
            return Ok(waiting);
        }

        self.with_batch_join(PendingBatchIntentKind::Board, amount_sats, None, || async {
        match self
            .client
            .settle_vtxos(&mut rng, &[], &onchain)
            .await
        {
            Ok(Some(JoinBatchOutcome::Completed(commitment_txid))) => {
                if self
                    .round_consumed_boarding_outpoint(commitment_txid, boarding_outpoint)
                    .await?
                {
                    let onchain_records = onchain
                        .iter()
                        .map(|outpoint| PendingBatchOutpointRecord {
                            txid: outpoint.txid.to_string(),
                            vout: outpoint.vout,
                        })
                        .collect::<Vec<_>>();
                    self.wallet_db
                        .remove_pending_batch_intents_overlapping(&onchain_records, &[]);
                    return Ok(Self::batch_join_completed_result(commitment_txid));
                }
                Ok(self.batch_join_duplicated_input_result(
                    PendingBatchIntentKind::Board,
                    &onchain,
                    &[],
                    amount_sats,
                ))
            }
            Ok(Some(JoinBatchOutcome::Waiting(intent))) => Ok(self.batch_join_waiting_result(
                PendingBatchIntentKind::Board,
                &intent,
                amount_sats,
            )),
            Ok(None) => Err(ArkWasmError::Boarding(
                "Settle returned no inputs even though boarding UTXOs looked spendable. Try again in a moment.".to_string(),
            )),
            Err(error) => {
                self.map_settle_error(
                    PendingBatchIntentKind::Board,
                    error,
                    &onchain,
                    &[],
                    amount_sats,
                )
                .await
            }
        }
        })
        .await
    }

    /// Confirm the finalized batch actually spent `boarding_outpoint`.
    ///
    /// arkd reports the commitment TXID only after broadcasting the round, so we inspect that TX's
    /// inputs directly — authoritative and free of mempool-index lag on the boarding address. The
    /// TX can take a moment to reach our backend, so we poll for it before concluding the input was
    /// skipped; only if it never becomes visible do we fall back to the boarding UTXO spend status.
    async fn round_consumed_boarding_outpoint(
        &self,
        commitment_txid: Txid,
        boarding_outpoint: OnchainOutPoint,
    ) -> ArkResult<bool> {
        for _ in 0..COMMITMENT_TX_VISIBILITY_MAX_POLLS {
            if let Some(commitment_tx) = self.client.blockchain().find_tx(&commitment_txid).await? {
                return Ok(commitment_tx
                    .input
                    .iter()
                    .any(|tx_in| tx_in.previous_output == boarding_outpoint.inner()));
            }
            sleep(COMMITMENT_TX_VISIBILITY_POLL_DELAY).await;
        }

        // The commitment TX never became visible; fall back to the boarding UTXO's spend status.
        let spend_status = self
            .client
            .blockchain()
            .get_output_status(boarding_outpoint.txid(), boarding_outpoint.vout())
            .await?;
        Ok(spend_status.spend_txid.is_some())
    }
    /// VTXOs in the renewal window for manual renew — excludes unilateral exit in progress.
    async fn expiring_outpoints(&self) -> ArkResult<Vec<OutPoint>> {
        let (vtxo_list, _) = if self.autonomous_mode() {
            self.snapshot_vtxo_list_and_script_map()?
        } else {
            self.client.list_vtxos().await?
        };
        let exclude_pre_unroll_unilateral_exit = unilateral_exit_in_progress_outpoints_from_pending(
            &self.wallet_db.pending_exit_deductions(),
        );
        let now = current_unix_timestamp();
        Ok(vtxo_list
            .all_unspent()
            .filter(|virtual_tx_outpoint| {
                if exclude_pre_unroll_unilateral_exit.contains(&virtual_tx_outpoint.outpoint) {
                    return false;
                }
                if virtual_tx_outpoint.expires_at <= 0 || virtual_tx_outpoint.created_at <= 0 {
                    return false;
                }
                let total_lifetime =
                    virtual_tx_outpoint.expires_at - virtual_tx_outpoint.created_at;
                let remaining = virtual_tx_outpoint.expires_at - now;
                remaining > 0
                    && (remaining as f64)
                        < (total_lifetime as f64 * VTXO_SELF_RENEW_REMAINING_FRACTION)
            })
            .map(|virtual_tx_outpoint| virtual_tx_outpoint.outpoint)
            .collect())
    }
}

pub(crate) fn classify_vtxo<F>(
    virtual_tx_outpoint: &VirtualTxOutPoint,
    dust: Amount,
    server_info: &ark_core::server::Info,
    now_unix_secs: i64,
    server_pk_for_script: F,
) -> VtxoClassificationDto
where
    F: Fn(&ScriptBuf) -> Option<XOnlyPublicKey>,
{
    if virtual_tx_outpoint.is_unrolled && !virtual_tx_outpoint.is_spent {
        return VtxoClassificationDto::Exiting;
    }
    if virtual_tx_outpoint.is_recoverable(dust) {
        if is_settleable_recoverable_vtxo(virtual_tx_outpoint, dust) {
            return VtxoClassificationDto::RecoverableSettleable;
        }
        return VtxoClassificationDto::RecoverablePendingOperatorSweep;
    }
    if virtual_tx_outpoint.is_spent || virtual_tx_outpoint.is_swept {
        return VtxoClassificationDto::Finalized;
    }
    if server_pk_for_script(&virtual_tx_outpoint.script)
        .map(|server_pk| server_info.signer_requires_recovery_at(server_pk, now_unix_secs))
        .unwrap_or(false)
    {
        return VtxoClassificationDto::PendingRecoveryDueToExpiredSigner;
    }
    if virtual_tx_outpoint.is_preconfirmed {
        return VtxoClassificationDto::PreConfirmed;
    }
    VtxoClassificationDto::Confirmed
}

pub(crate) fn map_vtxo_row<F>(
    virtual_tx_outpoint: &VirtualTxOutPoint,
    dust: Amount,
    server_info: &ark_core::server::Info,
    now_unix_secs: i64,
    server_pk_for_script: F,
    is_unilateral_exit_prepared: bool,
) -> VtxoRowDto
where
    F: Fn(&ScriptBuf) -> Option<XOnlyPublicKey>,
{
    let recoverable = virtual_tx_outpoint.is_recoverable(dust);
    VtxoRowDto {
        id: format!(
            "{}:{}",
            virtual_tx_outpoint.outpoint.txid, virtual_tx_outpoint.outpoint.vout
        ),
        amount_sats: virtual_tx_outpoint.amount.to_sat(),
        created_at: virtual_tx_outpoint.created_at,
        expires_at: virtual_tx_outpoint.expires_at,
        classification: classify_vtxo(
            virtual_tx_outpoint,
            dust,
            server_info,
            now_unix_secs,
            server_pk_for_script,
        ),
        is_preconfirmed: virtual_tx_outpoint.is_preconfirmed,
        is_recoverable: recoverable,
        is_unrolled: virtual_tx_outpoint.is_unrolled,
        is_swept: virtual_tx_outpoint.is_swept,
        is_spent: virtual_tx_outpoint.is_spent,
        is_unilateral_exit_prepared,
    }
}

fn map_vtxo_rows_from_list<F>(
    vtxo_list: &VtxoList,
    dust: Amount,
    server_info: &ark_core::server::Info,
    now_unix_secs: i64,
    server_pk_for_script: F,
    offchain_snapshot: Option<&OffchainVtxoSnapshot>,
) -> Vec<VtxoRowDto>
where
    F: Fn(&ScriptBuf) -> Option<XOnlyPublicKey>,
{
    let mut rows: Vec<VtxoRowDto> = vtxo_list
        .all()
        .map(|virtual_tx_outpoint| {
            let mut display_vtxo = virtual_tx_outpoint.clone();
            if let Some(snapshot) = offchain_snapshot
                && let Some(record) = local_snapshot_record_for_outpoint(
                    snapshot,
                    &display_vtxo.outpoint.txid,
                    display_vtxo.outpoint.vout,
                )
            {
                apply_local_snapshot_flags_to_vtxo(&mut display_vtxo, record);
            }
            let is_unilateral_exit_prepared = virtual_tx_outpoint_has_unilateral_exit_prepared(
                offchain_snapshot,
                virtual_tx_outpoint,
            );
            map_vtxo_row(
                &display_vtxo,
                dust,
                server_info,
                now_unix_secs,
                &server_pk_for_script,
                is_unilateral_exit_prepared,
            )
        })
        .collect();
    rows.sort_by_key(|row| row.expires_at);
    rows
}

fn empty_recoverable_vtxo_summary() -> RecoverableVtxoSummary {
    RecoverableVtxoSummary {
        outpoints: Vec::new(),
        total_sats: 0,
        count: 0,
    }
}

fn empty_recoverable_vtxo_buckets() -> RecoverableVtxoBuckets {
    RecoverableVtxoBuckets {
        settleable: empty_recoverable_vtxo_summary(),
        pending_operator_sweep: empty_recoverable_vtxo_summary(),
    }
}

/// VTXOs the operator agrees need no forfeit: swept or sub-dust.
pub(crate) fn is_settleable_recoverable_vtxo(
    virtual_tx_outpoint: &ark_core::server::VirtualTxOutPoint,
    dust: Amount,
) -> bool {
    virtual_tx_outpoint.is_swept || virtual_tx_outpoint.amount < dust
}

/// Client-expired VTXOs still awaiting operator sweep before batch settlement is safe.
pub(crate) fn is_pending_operator_sweep_recoverable_vtxo(
    virtual_tx_outpoint: &ark_core::server::VirtualTxOutPoint,
    dust: Amount,
) -> bool {
    virtual_tx_outpoint.is_recoverable(dust)
        && !is_settleable_recoverable_vtxo(virtual_tx_outpoint, dust)
}

fn recoverable_vtxo_summary_from_filtered<'a>(
    recoverable: impl Iterator<Item = &'a ark_core::server::VirtualTxOutPoint>,
) -> RecoverableVtxoSummary {
    let recoverable: Vec<_> = recoverable.collect();
    let total_sats = recoverable
        .iter()
        .fold(Amount::ZERO, |acc, vtxo| acc + vtxo.amount)
        .to_sat();
    let outpoints: Vec<OutPoint> = recoverable.into_iter().map(|vtxo| vtxo.outpoint).collect();
    RecoverableVtxoSummary {
        count: outpoints.len() as u32,
        total_sats,
        outpoints,
    }
}

/// Split recoverable VTXOs into settleable-now vs awaiting operator sweep buckets.
///
/// Settling client-expired unswept VTXOs goes through the no-forfeit recovery path, but the
/// operator's own clock/sweep state can still expect a forfeit — it then fails the round with
/// `missing forfeit tx` and wedges subsequent rounds. Only swept or sub-dust VTXOs are actionable.
///
/// `exclude_pre_unroll_unilateral_exit` drops VTXOs with a pending unilateral record before
/// `is_unrolled` is indexed locally (brief pre-unroll window).
pub(crate) fn recoverable_vtxo_buckets_from_list(
    vtxo_list: &ark_core::VtxoList,
    dust: Amount,
    exclude_pre_unroll_unilateral_exit: &HashSet<UnilateralExitOutpointKey>,
) -> RecoverableVtxoBuckets {
    let all_recoverable: Vec<_> = vtxo_list
        .recoverable()
        .filter(|vtxo| !exclude_pre_unroll_unilateral_exit.contains(&vtxo.outpoint))
        .collect();
    RecoverableVtxoBuckets {
        settleable: recoverable_vtxo_summary_from_filtered(
            all_recoverable
                .iter()
                .filter(|vtxo| is_settleable_recoverable_vtxo(vtxo, dust))
                .copied(),
        ),
        pending_operator_sweep: recoverable_vtxo_summary_from_filtered(
            all_recoverable
                .iter()
                .filter(|vtxo| is_pending_operator_sweep_recoverable_vtxo(vtxo, dust))
                .copied(),
        ),
    }
}

#[cfg(test)]
mod recoverable_vtxo_tests {
    use std::collections::HashSet;

    use ark_core::server::VirtualTxOutPoint;
    use bitcoin::hashes::Hash;
    use bitcoin::{Amount, OutPoint, ScriptBuf, Txid};

    use super::{
        is_pending_operator_sweep_recoverable_vtxo, is_settleable_recoverable_vtxo,
        recoverable_vtxo_buckets_from_list,
    };
    use crate::session::mappers::current_unix_timestamp;

    const DUST: Amount = Amount::from_sat(330);

    fn no_unilateral_exit_outpoints() -> HashSet<OutPoint> {
        HashSet::new()
    }

    fn sample_vtp(
        vout: u32,
        amount_sats: u64,
        expires_at: i64,
        is_swept: bool,
    ) -> VirtualTxOutPoint {
        sample_vtp_with_flags(vout, amount_sats, expires_at, is_swept, false)
    }

    fn sample_vtp_with_flags(
        vout: u32,
        amount_sats: u64,
        expires_at: i64,
        is_swept: bool,
        is_unrolled: bool,
    ) -> VirtualTxOutPoint {
        VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([vout as u8; 32]), vout),
            created_at: expires_at - 86_400,
            expires_at,
            amount: Amount::from_sat(amount_sats),
            script: ScriptBuf::new(),
            is_preconfirmed: false,
            is_swept,
            is_unrolled,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        }
    }

    #[test]
    fn settleable_recoverable_includes_operator_swept_vtxos() {
        let now = current_unix_timestamp();
        let vtxo_list = ark_core::VtxoList::new(
            DUST,
            vec![
                sample_vtp(0, 25_000, now - 1, true),
                sample_vtp(1, 25_000, now - 1, true),
                sample_vtp(2, 10_000, now + 86_400, false),
            ],
        );
        let buckets =
            recoverable_vtxo_buckets_from_list(&vtxo_list, DUST, &no_unilateral_exit_outpoints());
        assert_eq!(buckets.settleable.count, 2);
        assert_eq!(buckets.settleable.total_sats, 50_000);
        assert_eq!(buckets.pending_operator_sweep.count, 0);
    }

    #[test]
    fn settleable_recoverable_includes_sub_dust_vtxos() {
        let now = current_unix_timestamp();
        let vtxo_list = ark_core::VtxoList::new(
            DUST,
            vec![sample_vtp(0, DUST.to_sat() - 1, now + 86_400, false)],
        );
        let buckets =
            recoverable_vtxo_buckets_from_list(&vtxo_list, DUST, &no_unilateral_exit_outpoints());
        assert_eq!(buckets.settleable.count, 1);
        assert_eq!(buckets.settleable.total_sats, DUST.to_sat() - 1);
        assert_eq!(buckets.pending_operator_sweep.count, 0);
    }

    #[test]
    fn pending_operator_sweep_counts_client_expired_unswept_vtxos() {
        let now = current_unix_timestamp();
        let vtxo_list = ark_core::VtxoList::new(
            DUST,
            vec![
                sample_vtp(0, 25_000, now - 1, false),
                sample_vtp(1, 25_000, now - 1, false),
            ],
        );
        let buckets =
            recoverable_vtxo_buckets_from_list(&vtxo_list, DUST, &no_unilateral_exit_outpoints());
        assert_eq!(buckets.settleable.count, 0);
        assert_eq!(buckets.pending_operator_sweep.count, 2);
        assert_eq!(buckets.pending_operator_sweep.total_sats, 50_000);
    }

    #[test]
    fn recoverable_buckets_empty_when_none_recoverable() {
        let now = current_unix_timestamp();
        let vtxo_list =
            ark_core::VtxoList::new(DUST, vec![sample_vtp(0, 10_000, now + 86_400, false)]);
        let buckets =
            recoverable_vtxo_buckets_from_list(&vtxo_list, DUST, &no_unilateral_exit_outpoints());
        assert_eq!(buckets.settleable.count, 0);
        assert_eq!(buckets.pending_operator_sweep.count, 0);
    }

    #[test]
    // Unrolled + expired VTXOs land in exiting, not recoverable (vendored ark-core bucketing).
    fn recoverable_excludes_unilateral_exit_in_progress_outpoint() {
        let now = current_unix_timestamp();
        let exiting = sample_vtp_with_flags(0, 25_000, now - 1, true, true);
        let vtxo_list = ark_core::VtxoList::new(DUST, vec![exiting]);
        let buckets =
            recoverable_vtxo_buckets_from_list(&vtxo_list, DUST, &no_unilateral_exit_outpoints());
        assert_eq!(buckets.settleable.count, 0);
        assert_eq!(buckets.pending_operator_sweep.count, 0);
    }

    #[test]
    fn recoverable_excludes_pending_operator_sweep_when_exiting() {
        let now = current_unix_timestamp();
        let exiting = sample_vtp_with_flags(1, 25_000, now - 1, false, true);
        let vtxo_list = ark_core::VtxoList::new(DUST, vec![exiting]);
        let buckets =
            recoverable_vtxo_buckets_from_list(&vtxo_list, DUST, &no_unilateral_exit_outpoints());
        assert_eq!(buckets.settleable.count, 0);
        assert_eq!(buckets.pending_operator_sweep.count, 0);
    }

    #[test]
    fn recoverable_excludes_pre_unroll_pending_outpoint() {
        let now = current_unix_timestamp();
        let expired_before_unroll = sample_vtp_with_flags(2, 25_000, now - 1, false, false);
        let vtxo_list = ark_core::VtxoList::new(DUST, vec![expired_before_unroll.clone()]);
        let exclude = HashSet::from([expired_before_unroll.outpoint]);
        let buckets = recoverable_vtxo_buckets_from_list(&vtxo_list, DUST, &exclude);
        assert_eq!(buckets.settleable.count, 0);
        assert_eq!(buckets.pending_operator_sweep.count, 0);
    }

    #[test]
    fn recoverable_still_includes_non_exiting_swept_vtxo() {
        let now = current_unix_timestamp();
        let other = sample_vtp(1, 30_000, now - 1, true);
        let vtxo_list = ark_core::VtxoList::new(DUST, vec![other]);
        let buckets =
            recoverable_vtxo_buckets_from_list(&vtxo_list, DUST, &no_unilateral_exit_outpoints());
        assert_eq!(buckets.settleable.count, 1);
        assert_eq!(buckets.settleable.total_sats, 30_000);
    }

    #[test]
    fn settleable_and_pending_operator_sweep_classifiers_are_disjoint() {
        let now = current_unix_timestamp();
        let vtxo = sample_vtp(0, 25_000, now - 1, false);
        assert!(is_pending_operator_sweep_recoverable_vtxo(&vtxo, DUST));
        assert!(!is_settleable_recoverable_vtxo(&vtxo, DUST));

        let swept = sample_vtp(1, 25_000, now - 1, true);
        assert!(is_settleable_recoverable_vtxo(&swept, DUST));
        assert!(!is_pending_operator_sweep_recoverable_vtxo(&swept, DUST));
    }
}

#[cfg(test)]
mod vtxo_row_classification_tests {
    use std::collections::HashMap;
    use std::str::FromStr;

    use ark_core::server::{DeprecatedSigner, Info, VirtualTxOutPoint};
    use bitcoin::address::NetworkUnchecked;
    use bitcoin::hashes::Hash;
    use bitcoin::secp256k1::PublicKey;
    use bitcoin::{Amount, Network, OutPoint, ScriptBuf, Txid, XOnlyPublicKey};

    use crate::api_types::VtxoClassificationDto;

    use super::{classify_vtxo, current_unix_timestamp, map_vtxo_row};

    const DUST: Amount = Amount::from_sat(330);

    struct VtpFlags {
        is_preconfirmed: bool,
        is_swept: bool,
        is_unrolled: bool,
        is_spent: bool,
    }

    fn sample_vtp(
        vout: u8,
        amount_sats: u64,
        expires_at: i64,
        flags: VtpFlags,
    ) -> VirtualTxOutPoint {
        VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([vout; 32]), u32::from(vout)),
            created_at: expires_at - 86_400,
            expires_at,
            amount: Amount::from_sat(amount_sats),
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

    fn default_flags() -> VtpFlags {
        VtpFlags {
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
        }
    }

    fn test_server_info(current_hex: &str, deprecated: Vec<(&str, i64)>) -> Info {
        let dummy_address: bitcoin::Address<NetworkUnchecked> =
            "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
                .parse()
                .unwrap();
        Info {
            version: "1".into(),
            signer_pk: PublicKey::from_str(current_hex).expect("valid key"),
            forfeit_pk: PublicKey::from_str(current_hex).expect("valid key"),
            forfeit_address: dummy_address.assume_checked(),
            checkpoint_tapscript: ScriptBuf::new(),
            network: Network::Signet,
            session_duration: 0,
            unilateral_exit_delay: bitcoin::Sequence::ZERO,
            boarding_exit_delay: bitcoin::Sequence::ZERO,
            utxo_min_amount: None,
            utxo_max_amount: None,
            vtxo_min_amount: None,
            vtxo_max_amount: None,
            dust: DUST,
            fees: None,
            scheduled_session: None,
            deprecated_signers: deprecated
                .into_iter()
                .map(|(key, cutoff)| DeprecatedSigner {
                    pk: PublicKey::from_str(key).expect("valid key"),
                    cutoff_date: cutoff,
                })
                .collect(),
            service_status: HashMap::new(),
            digest: String::new(),
            max_tx_weight: 0,
            max_op_return_outputs: 0,
        }
    }

    fn no_server_pk(_script: &ScriptBuf) -> Option<XOnlyPublicKey> {
        None
    }

    #[test]
    fn classify_vtxo_pre_confirmed() {
        let now = current_unix_timestamp();
        let vtxo = sample_vtp(
            0,
            25_000,
            now + 86_400,
            VtpFlags {
                is_preconfirmed: true,
                ..default_flags()
            },
        );
        let server_info = test_server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![],
        );
        assert_eq!(
            classify_vtxo(&vtxo, DUST, &server_info, now, no_server_pk),
            VtxoClassificationDto::PreConfirmed
        );
    }

    #[test]
    fn classify_vtxo_confirmed() {
        let now = current_unix_timestamp();
        let vtxo = sample_vtp(0, 25_000, now + 86_400, default_flags());
        let server_info = test_server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![],
        );
        assert_eq!(
            classify_vtxo(&vtxo, DUST, &server_info, now, no_server_pk),
            VtxoClassificationDto::Confirmed
        );
    }

    #[test]
    fn classify_vtxo_recoverable_settleable_swept() {
        let now = current_unix_timestamp();
        let vtxo = sample_vtp(
            0,
            25_000,
            now + 86_400,
            VtpFlags {
                is_swept: true,
                ..default_flags()
            },
        );
        let server_info = test_server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![],
        );
        assert_eq!(
            classify_vtxo(&vtxo, DUST, &server_info, now, no_server_pk),
            VtxoClassificationDto::RecoverableSettleable
        );
    }

    #[test]
    fn classify_vtxo_recoverable_settleable_sub_dust() {
        let now = current_unix_timestamp();
        let vtxo = sample_vtp(0, DUST.to_sat() - 1, now + 86_400, default_flags());
        let server_info = test_server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![],
        );
        assert_eq!(
            classify_vtxo(&vtxo, DUST, &server_info, now, no_server_pk),
            VtxoClassificationDto::RecoverableSettleable
        );
    }

    #[test]
    fn classify_vtxo_recoverable_pending_operator_sweep() {
        let now = current_unix_timestamp();
        let vtxo = sample_vtp(0, 25_000, now - 1, default_flags());
        let server_info = test_server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![],
        );
        assert_eq!(
            classify_vtxo(&vtxo, DUST, &server_info, now, no_server_pk),
            VtxoClassificationDto::RecoverablePendingOperatorSweep
        );
    }

    #[test]
    fn classify_vtxo_pending_recovery_due_to_expired_signer() {
        let script = ScriptBuf::from_bytes(vec![0x51]);
        let future_expiry = 2_000_000_000_i64;
        let vtxo = VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([7; 32]), 0),
            created_at: future_expiry - 86_400,
            expires_at: future_expiry,
            amount: Amount::from_sat(50_000),
            script: script.clone(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        };
        let deprecated_pk = PublicKey::from_str(
            "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
        )
        .expect("valid key")
        .x_only_public_key()
        .0;
        let server_info = test_server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![(
                "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
                500_000,
            )],
        );
        let now = 1_000_000_i64;
        assert_eq!(
            classify_vtxo(&vtxo, DUST, &server_info, now, |lookup_script| {
                if lookup_script == &script {
                    Some(deprecated_pk)
                } else {
                    None
                }
            },),
            VtxoClassificationDto::PendingRecoveryDueToExpiredSigner
        );
    }

    #[test]
    fn classify_vtxo_exiting() {
        let now = current_unix_timestamp();
        let vtxo = sample_vtp(
            0,
            25_000,
            now + 86_400,
            VtpFlags {
                is_unrolled: true,
                ..default_flags()
            },
        );
        let server_info = test_server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![],
        );
        assert_eq!(
            classify_vtxo(&vtxo, DUST, &server_info, now, no_server_pk),
            VtxoClassificationDto::Exiting
        );
    }

    #[test]
    fn classify_vtxo_finalized_spent() {
        let now = current_unix_timestamp();
        let vtxo = sample_vtp(
            0,
            25_000,
            now + 86_400,
            VtpFlags {
                is_spent: true,
                ..default_flags()
            },
        );
        let server_info = test_server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![],
        );
        assert_eq!(
            classify_vtxo(&vtxo, DUST, &server_info, now, no_server_pk),
            VtxoClassificationDto::Finalized
        );
    }

    #[test]
    fn classify_vtxo_exiting_beats_recoverable() {
        let now = current_unix_timestamp();
        let vtxo = sample_vtp(
            0,
            25_000,
            now - 1,
            VtpFlags {
                is_unrolled: true,
                ..default_flags()
            },
        );
        let server_info = test_server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![],
        );
        assert_eq!(
            classify_vtxo(&vtxo, DUST, &server_info, now, no_server_pk),
            VtxoClassificationDto::Exiting
        );
    }

    #[test]
    fn map_vtxo_row_sets_id_and_flags() {
        let now = current_unix_timestamp();
        let vtxo = sample_vtp(
            3,
            42_000,
            now + 86_400,
            VtpFlags {
                is_preconfirmed: true,
                ..default_flags()
            },
        );
        let server_info = test_server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![],
        );
        let row = map_vtxo_row(&vtxo, DUST, &server_info, now, no_server_pk, false);
        assert_eq!(row.id, format!("{}:3", vtxo.outpoint.txid));
        assert_eq!(row.amount_sats, 42_000);
        assert_eq!(row.created_at, vtxo.created_at);
        assert_eq!(row.expires_at, vtxo.expires_at);
        assert_eq!(row.classification, VtxoClassificationDto::PreConfirmed);
        assert!(row.is_preconfirmed);
        assert!(!row.is_recoverable);
        assert!(!row.is_unrolled);
        assert!(!row.is_swept);
        assert!(!row.is_spent);
        assert!(!row.is_unilateral_exit_prepared);
    }

    #[test]
    fn map_vtxo_rows_apply_local_snapshot_spent_overrides_operator_exit_state() {
        use ark_core::VtxoList;
        use std::collections::BTreeMap;

        use crate::persistence::{OffchainVtxoSnapshot, VirtualTxOutPointRecord};

        use super::map_vtxo_rows_from_list;

        let now = current_unix_timestamp();
        let txid = Txid::from_byte_array([0x69; 32]);
        let vtxo = VirtualTxOutPoint {
            outpoint: OutPoint::new(txid, 0),
            created_at: now - 86_400,
            expires_at: now + 86_400,
            amount: Amount::from_sat(50_000),
            script: ScriptBuf::new(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: true,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        };
        let vtxo_list = VtxoList::new(DUST, vec![vtxo]);
        let snapshot = OffchainVtxoSnapshot {
            synced_at: now,
            dust_sats: DUST.to_sat(),
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid: txid.to_string(),
                vout: 0,
                created_at: now - 86_400,
                expires_at: now + 86_400,
                amount_sats: 50_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: true,
                is_spent: true,
                spent_by: Some(Txid::from_byte_array([0x7e; 32]).to_string()),
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
            }],
            unilateral_exit_materials_by_leaf_tx: BTreeMap::new(),
        };
        let server_info = test_server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![],
        );

        let rows = map_vtxo_rows_from_list(
            &vtxo_list,
            DUST,
            &server_info,
            now,
            no_server_pk,
            Some(&snapshot),
        );

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].classification, VtxoClassificationDto::Finalized);
        assert!(rows[0].is_spent);
        assert!(rows[0].is_unrolled);
    }
}
