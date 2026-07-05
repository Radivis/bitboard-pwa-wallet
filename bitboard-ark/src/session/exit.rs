use std::collections::HashMap;
use std::collections::HashSet;
use std::str::FromStr;

use ark_client::Blockchain;
use bitcoin::{Amount, OutPoint, Txid, secp256k1::rand::rngs::OsRng};

use crate::api_types::{
    COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS,
    CollaborativeExitFeeEstimateDto, CollaborativeExitParams, CompleteUnilateralExitParams,
    ExitCandidateRow, OnchainBumperInfoDto, UnilateralExitCompletionFeeEstimateDto,
    UnilateralExitCompletionFeeEstimateParams, UnilateralExitFeeEstimateDto,
    UnilateralExitFeeParams, UnilateralExitInProgressRow, UnrollProgressEvent, UnrollResult,
};
use crate::constants::{
    MIN_FEE_RATE_SAT_PER_VB, UNILATERAL_EXIT_CHILD_VSIZE_VB, UNROLL_EVENT_TYPE_DONE,
    UNROLL_EVENT_TYPE_UNROLL, UNROLL_EVENT_TYPE_WAIT,
};
use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::{
    UnilateralExitOutpointKey, exit_outpoint_key, exit_outpoint_key_from_str,
    is_unilateral_exit_in_progress_outpoint, unilateral_exit_in_progress_outpoints,
};
use crate::persistence::{PendingExitDeductionRecord, PendingExitKind};

use super::ArkSession;
use super::mappers::{
    empty_fee_info, map_exit_candidate, map_intent_fee_configured, parse_onchain_address,
    parse_outpoint,
};

/// arkd's indexer can lag behind confirmed unroll broadcasts when marking `is_unrolled`.
const COMPLETION_UNROLLED_INDEXER_POLL_MAX: u8 = 60;
const COMPLETION_UNROLLED_INDEXER_POLL_DELAY: std::time::Duration =
    std::time::Duration::from_millis(1_000);

fn completion_awaits_unrolled_indexer(error: &ark_client::Error) -> bool {
    error
        .to_string()
        .contains("no matching unrolled VTXOs found for completion")
}

#[cfg(target_arch = "wasm32")]
async fn sleep(duration: std::time::Duration) {
    bitboard_wasm_sleep::sleep_for(duration).await;
}

#[cfg(not(target_arch = "wasm32"))]
async fn sleep(_duration: std::time::Duration) {}

fn collaborative_exit_estimate_error_code(is_coin_select: bool) -> Option<&'static str> {
    if is_coin_select {
        Some(COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS)
    } else {
        None
    }
}

fn collaborative_exit_estimate_error_fields(
    error: ark_client::Error,
) -> (String, Option<&'static str>) {
    let estimate_error_code = collaborative_exit_estimate_error_code(error.is_coin_select());
    (error.to_string(), estimate_error_code)
}

/// Explicit exit amount, or cooperatively spendable offchain balance for a full exit.
fn resolve_cooperative_exit_amount(amount_sats: Option<u64>, gross_spendable_sats: u64) -> Amount {
    amount_sats
        .map(Amount::from_sat)
        .unwrap_or_else(|| Amount::from_sat(gross_spendable_sats))
}

impl ArkSession {
    pub(crate) fn unilateral_exit_in_progress_outpoints(
        &self,
    ) -> ArkResult<HashSet<UnilateralExitOutpointKey>> {
        let wallet_snapshot = self.wallet_db.snapshot();
        let snapshot = wallet_snapshot.offchain_vtxo_snapshot.as_ref();
        let pending = self.wallet_db.pending_exit_deductions();
        unilateral_exit_in_progress_outpoints(snapshot, &pending)
    }

    fn pending_unilateral_started_at_by_outpoint(
        pending: &[PendingExitDeductionRecord],
    ) -> HashMap<UnilateralExitOutpointKey, i64> {
        pending
            .iter()
            .filter(|record| record.kind == PendingExitKind::Unilateral)
            .filter_map(|record| {
                let txid = record.vtxo_txid.as_deref()?;
                let vout = record.vout?;
                let outpoint = exit_outpoint_key_from_str(txid, vout)?;
                Some((outpoint, record.started_at))
            })
            .collect()
    }

    fn pending_unilateral_amount_sats(
        pending: &[PendingExitDeductionRecord],
        outpoint: &UnilateralExitOutpointKey,
    ) -> u64 {
        pending
            .iter()
            .find(|record| {
                record.kind == PendingExitKind::Unilateral
                    && record
                        .vtxo_txid
                        .as_deref()
                        .and_then(|txid| exit_outpoint_key_from_str(txid, record.vout?))
                        == Some(*outpoint)
            })
            .map(|record| record.amount_sats)
            .unwrap_or(0)
    }

    pub async fn list_exit_candidates(&self) -> ArkResult<Vec<ExitCandidateRow>> {
        let in_progress = self.unilateral_exit_in_progress_outpoints()?;
        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let dust = self.client.server_info()?.dust;
        let rows = vtxo_list
            .all()
            .map(|virtual_tx_outpoint| map_exit_candidate(virtual_tx_outpoint, dust))
            .filter(|row| {
                !row.can_complete
                    && !is_unilateral_exit_in_progress_outpoint(&in_progress, &row.txid, row.vout)
            })
            .collect();
        Ok(rows)
    }

    pub async fn list_unilateral_exits_in_progress(
        &self,
    ) -> ArkResult<Vec<UnilateralExitInProgressRow>> {
        let in_progress = self.unilateral_exit_in_progress_outpoints()?;
        if in_progress.is_empty() {
            return Ok(Vec::new());
        }

        let pending = self.wallet_db.pending_exit_deductions();
        let started_at_by_outpoint = Self::pending_unilateral_started_at_by_outpoint(&pending);

        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let dust = self.client.server_info()?.dust;
        let operator_by_outpoint: HashMap<UnilateralExitOutpointKey, _> = vtxo_list
            .all()
            .map(|virtual_tx_outpoint| {
                (
                    exit_outpoint_key(
                        virtual_tx_outpoint.outpoint.txid,
                        virtual_tx_outpoint.outpoint.vout,
                    ),
                    virtual_tx_outpoint,
                )
            })
            .collect();

        let wallet_snapshot = self.wallet_db.snapshot();
        let snapshot_records = wallet_snapshot
            .offchain_vtxo_snapshot
            .as_ref()
            .map(|snapshot| snapshot.virtual_tx_outpoints.as_slice())
            .unwrap_or(&[]);

        let mut rows = Vec::with_capacity(in_progress.len());
        for outpoint in in_progress {
            let txid = outpoint.txid.to_string();
            let vout = outpoint.vout;
            if let Some(virtual_tx_outpoint) = operator_by_outpoint.get(&outpoint) {
                let candidate = map_exit_candidate(virtual_tx_outpoint, dust);
                rows.push(UnilateralExitInProgressRow {
                    id: candidate.id,
                    txid: candidate.txid,
                    vout: candidate.vout,
                    amount_sats: candidate.amount_sats,
                    virtual_status_state: candidate.virtual_status_state,
                    can_complete: candidate.can_complete,
                    started_at: started_at_by_outpoint.get(&outpoint).copied(),
                });
                continue;
            }

            if let Some(record) = snapshot_records
                .iter()
                .find(|record| record.txid == txid && record.vout == vout)
            {
                let virtual_status_state = if record.is_spent {
                    "spent".to_string()
                } else if record.is_unrolled {
                    "unrolled".to_string()
                } else {
                    "settled".to_string()
                };
                rows.push(UnilateralExitInProgressRow {
                    id: format!("{txid}:{vout}"),
                    txid,
                    vout,
                    amount_sats: record.amount_sats,
                    virtual_status_state,
                    can_complete: record.is_unrolled && !record.is_spent,
                    started_at: started_at_by_outpoint.get(&outpoint).copied(),
                });
                continue;
            }

            rows.push(UnilateralExitInProgressRow {
                id: format!("{txid}:{vout}"),
                txid,
                vout,
                amount_sats: Self::pending_unilateral_amount_sats(&pending, &outpoint),
                virtual_status_state: "settled".to_string(),
                can_complete: false,
                started_at: started_at_by_outpoint.get(&outpoint).copied(),
            });
        }

        rows.sort_by_key(|row| row.started_at.unwrap_or(i64::MAX));
        Ok(rows)
    }

    pub async fn onchain_bumper_info(&self) -> ArkResult<OnchainBumperInfoDto> {
        // The on-chain (bumper) wallet is only synced once at session open, so without a refresh
        // here the unilateral-exit dialog would report a stale session-open balance and ignore any
        // funds the user added afterwards. Re-sync before reading so both the displayed balance and
        // the `bumper_sufficient` gate (which goes through this) reflect current on-chain funds.
        self.client.sync_onchain_wallet().await?;
        let address = self.client.onchain_wallet_address()?;
        let balance = self.client.onchain_wallet_balance()?;
        let server_info = self.client.server_info()?;
        let (unilateral_exit_timelock_blocks, unilateral_exit_timelock_seconds) =
            super::mappers::unilateral_exit_timelock_parts(server_info.unilateral_exit_delay);
        Ok(OnchainBumperInfoDto {
            address: address.to_string(),
            balance_sats: balance.confirmed.to_sat(),
            unilateral_exit_timelock_blocks,
            unilateral_exit_timelock_seconds,
        })
    }

    pub async fn collaborative_exit(&self, params: CollaborativeExitParams) -> ArkResult<String> {
        let destination = parse_onchain_address(&params.destination_address, self.network())?;
        let buckets = self.resolve_offchain_balance_buckets().await?;
        let baseline_offchain_spendable_sats = buckets.gross_spendable_sats();
        let exit_amount =
            resolve_cooperative_exit_amount(params.amount_sats, baseline_offchain_spendable_sats);
        let mut rng = OsRng;
        let txid = self
            .client
            .collaborative_redeem(&mut rng, destination, exit_amount)
            .await?;
        self.record_pending_collaborative_exit(
            exit_amount.to_sat(),
            baseline_offchain_spendable_sats,
        );
        Ok(txid.to_string())
    }

    pub async fn collaborative_exit_fee_estimate(
        &self,
        destination_address: &str,
        amount_sats: Option<u64>,
    ) -> ArkResult<CollaborativeExitFeeEstimateDto> {
        let fees = self
            .client
            .server_info()?
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
                    estimate_error_code: None,
                });
            }
        };

        let gross_spendable_sats = self
            .resolve_offchain_balance_buckets()
            .await?
            .gross_spendable_sats();
        let to_amount = resolve_cooperative_exit_amount(amount_sats, gross_spendable_sats);

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
                    estimate_error_code: None,
                })
            }
            Err(error) => {
                let (estimate_error, estimate_error_code) =
                    collaborative_exit_estimate_error_fields(error);
                Ok(CollaborativeExitFeeEstimateDto {
                    tx_fee_rate: fees.tx_fee_rate,
                    intent_fee_configured,
                    estimated_total_fee_sats: None,
                    estimated_receive_sats: None,
                    estimate_error: Some(estimate_error),
                    estimate_error_code,
                })
            }
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

        match self.client.get_vtxo_chain(outpoint).await {
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
            (steps as f64 * fee_rate_sat_per_vb * UNILATERAL_EXIT_CHILD_VSIZE_VB as f64).ceil()
                as u64
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

        self.mark_vtxo_unrolled_in_snapshot(txid, vout)?;
        let _ = self.sync_with_operator().await;

        Ok(UnrollResult {
            vtxo_txid: done_vtxo_txid,
        })
    }

    fn mark_vtxo_unrolled_in_snapshot(&self, txid: &str, vout: u32) -> ArkResult<()> {
        let Some(mut snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() else {
            return Ok(());
        };
        for record in &mut snapshot.virtual_tx_outpoints {
            if record.txid == txid && record.vout == vout {
                record.is_unrolled = true;
            }
        }
        self.wallet_db.set_offchain_vtxo_snapshot(snapshot);
        Ok(())
    }

    pub async fn complete_unilateral_exit(
        &self,
        params: CompleteUnilateralExitParams,
    ) -> ArkResult<String> {
        if params.vtxo_txids.is_empty() {
            return Err(ArkWasmError::EmptyVtxoTxids);
        }

        let mut deduped_vtxo_txids = Vec::new();
        let mut seen_txids = HashSet::new();
        for vtxo_txid in params.vtxo_txids {
            if seen_txids.insert(vtxo_txid.clone()) {
                deduped_vtxo_txids.push(vtxo_txid);
            }
        }

        let in_progress = self.unilateral_exit_in_progress_outpoints()?;
        for vtxo_txid in &deduped_vtxo_txids {
            let vtxo_txid_parsed = Txid::from_str(vtxo_txid)
                .map_err(|error| ArkWasmError::InvalidTxid(error.to_string()))?;
            let in_unilateral_exit = in_progress
                .iter()
                .any(|outpoint| outpoint.txid == vtxo_txid_parsed);
            if !in_unilateral_exit {
                return Err(ArkWasmError::VtxoNotInUnilateralExit {
                    txid: vtxo_txid.clone(),
                });
            }
        }

        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let dust = self.client.server_info()?.dust;
        for vtxo_txid in &deduped_vtxo_txids {
            let Some(virtual_tx_outpoint) = vtxo_list.all().find(|virtual_tx_outpoint| {
                virtual_tx_outpoint.outpoint.txid.to_string() == *vtxo_txid
            }) else {
                continue;
            };
            let candidate = map_exit_candidate(virtual_tx_outpoint, dust);
            if !candidate.can_complete {
                return Err(ArkWasmError::VtxoUnilateralExitNotReady {
                    txid: vtxo_txid.clone(),
                });
            }
        }

        let vtxo_txids: Vec<Txid> = deduped_vtxo_txids
            .iter()
            .map(|txid| {
                Txid::from_str(txid).map_err(|error| ArkWasmError::InvalidTxid(error.to_string()))
            })
            .collect::<Result<_, _>>()?;

        let destination = parse_onchain_address(&params.destination_address, self.network())?;
        let fee_rate_sat_per_vb =
            resolve_completion_fee_rate_sat_per_vb(params.fee_rate_sat_per_vb);
        let mut last_error: Option<ark_client::Error> = None;
        for _ in 0..COMPLETION_UNROLLED_INDEXER_POLL_MAX {
            self.sync_with_operator().await?;
            match self
                .client
                .send_on_chain_for_vtxo_txids(
                    destination.clone(),
                    &vtxo_txids,
                    Some(fee_rate_sat_per_vb),
                )
                .await
            {
                Ok(txid) => {
                    self.clear_pending_unilateral_exits_for_txids(&vtxo_txids);
                    return Ok(txid.to_string());
                }
                Err(error) if completion_awaits_unrolled_indexer(&error) => {
                    last_error = Some(error);
                    sleep(COMPLETION_UNROLLED_INDEXER_POLL_DELAY).await;
                }
                Err(error) => return Err(error.into()),
            }
        }

        Err(last_error.map(Into::into).unwrap_or_else(|| {
            ArkWasmError::Boarding(
                "Timed out waiting for the operator indexer to mark the VTXO as unrolled"
                    .to_string(),
            )
        }))
    }

    pub async fn estimate_unilateral_exit_completion(
        &self,
        params: UnilateralExitCompletionFeeEstimateParams,
    ) -> ArkResult<UnilateralExitCompletionFeeEstimateDto> {
        if params.vtxo_txids.is_empty() {
            return Err(ArkWasmError::EmptyVtxoTxids);
        }

        let destination = match parse_onchain_address(&params.destination_address, self.network()) {
            Ok(address) => address,
            Err(error) => {
                return Ok(UnilateralExitCompletionFeeEstimateDto {
                    selected_total_sats: 0,
                    estimated_fee_sats: 0,
                    estimated_receive_sats: 0,
                    fee_rate_sat_per_vb: MIN_FEE_RATE_SAT_PER_VB,
                    estimate_error: Some(error.to_string()),
                });
            }
        };

        let mut deduped_vtxo_txids = Vec::new();
        let mut seen_txids = HashSet::new();
        for vtxo_txid in params.vtxo_txids {
            if seen_txids.insert(vtxo_txid.clone()) {
                deduped_vtxo_txids.push(vtxo_txid);
            }
        }

        let vtxo_txids: Vec<Txid> = match deduped_vtxo_txids
            .iter()
            .map(|txid| {
                Txid::from_str(txid).map_err(|error| ArkWasmError::InvalidTxid(error.to_string()))
            })
            .collect::<Result<_, _>>()
        {
            Ok(txids) => txids,
            Err(error) => {
                return Ok(UnilateralExitCompletionFeeEstimateDto {
                    selected_total_sats: 0,
                    estimated_fee_sats: 0,
                    estimated_receive_sats: 0,
                    fee_rate_sat_per_vb: MIN_FEE_RATE_SAT_PER_VB,
                    estimate_error: Some(error.to_string()),
                });
            }
        };

        let fee_rate_sat_per_vb =
            resolve_completion_fee_rate_sat_per_vb(params.fee_rate_sat_per_vb);

        match self
            .client
            .estimate_send_on_chain_for_vtxo_txids(
                destination,
                &vtxo_txids,
                Some(fee_rate_sat_per_vb),
            )
            .await
        {
            Ok((fee, to_amount, selected_amount)) => Ok(UnilateralExitCompletionFeeEstimateDto {
                selected_total_sats: selected_amount.to_sat(),
                estimated_fee_sats: fee.to_sat(),
                estimated_receive_sats: to_amount.to_sat(),
                fee_rate_sat_per_vb,
                estimate_error: None,
            }),
            Err(error) => Ok(UnilateralExitCompletionFeeEstimateDto {
                selected_total_sats: 0,
                estimated_fee_sats: 0,
                estimated_receive_sats: 0,
                fee_rate_sat_per_vb,
                estimate_error: Some(error.to_string()),
            }),
        }
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
}

fn resolve_completion_fee_rate_sat_per_vb(override_rate_sat_per_vb: Option<f64>) -> f64 {
    override_rate_sat_per_vb
        .unwrap_or(MIN_FEE_RATE_SAT_PER_VB)
        .max(MIN_FEE_RATE_SAT_PER_VB)
}

#[cfg(test)]
mod collaborative_exit_estimate_tests {
    use super::{
        collaborative_exit_estimate_error_code, resolve_completion_fee_rate_sat_per_vb,
        resolve_cooperative_exit_amount,
    };
    use crate::api_types::COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS;
    use bitcoin::Amount;

    #[test]
    fn maps_coin_select_to_insufficient_cooperative_inputs_code() {
        assert_eq!(
            collaborative_exit_estimate_error_code(true),
            Some(COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS)
        );
    }

    #[test]
    fn leaves_non_coin_select_without_code() {
        assert_eq!(collaborative_exit_estimate_error_code(false), None);
    }

    #[test]
    fn resolve_cooperative_exit_amount_uses_explicit_sats_when_provided() {
        assert_eq!(
            resolve_cooperative_exit_amount(Some(25_000), 100_000).to_sat(),
            25_000
        );
    }

    #[test]
    fn resolve_cooperative_exit_amount_defaults_to_gross_spendable_for_full_exit() {
        assert_eq!(
            resolve_cooperative_exit_amount(None, 42_000).to_sat(),
            42_000
        );
        assert_eq!(resolve_cooperative_exit_amount(None, 0), Amount::ZERO);
    }

    #[test]
    fn completion_fee_rate_prefers_override_and_enforces_minimum() {
        assert_eq!(resolve_completion_fee_rate_sat_per_vb(Some(5.0)), 5.0);
        assert_eq!(resolve_completion_fee_rate_sat_per_vb(Some(0.05)), 0.1);
        assert_eq!(resolve_completion_fee_rate_sat_per_vb(None), 0.1);
    }
}
