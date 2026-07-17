use std::collections::HashMap;
use std::collections::HashSet;
use std::str::FromStr;

use ark_client::Blockchain;
use ark_core::VtxoList;
use bitcoin::{Amount, OutPoint, Txid, secp256k1::rand::rngs::OsRng};

use crate::api_types::{
    COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS,
    CollaborativeExitFeeEstimateDto, CollaborativeExitParams, CompleteUnilateralExitParams,
    ExitCandidateRow, MissingBlocktimeCompletionInputDto, OnchainBumperInfoDto,
    UnilateralExitCompletionFeeEstimateDto, UnilateralExitCompletionFeeEstimateParams,
    UnilateralExitFeeEstimateDto, UnilateralExitFeeParams, UnilateralExitInProgressRow,
    UnrollProgressEvent, UnrollResult,
};
use crate::constants::{
    MIN_FEE_RATE_SAT_PER_VB, UNILATERAL_EXIT_CHILD_VSIZE_VB, UNROLL_EVENT_TYPE_DONE,
    UNROLL_EVENT_TYPE_INDEXER, UNROLL_EVENT_TYPE_UNROLL, UNROLL_EVENT_TYPE_WAIT,
};
use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::{
    UnilateralExitOutpointKey, exit_outpoint_key, exit_outpoint_key_from_str,
    is_unilateral_exit_in_progress_outpoint, unilateral_exit_in_progress_outpoints,
};
use crate::persistence::{
    JsonPersistenceDb, OffchainVtxoSnapshot, PendingExitDeductionRecord, PendingExitKind,
};

use super::ArkSession;
use super::exit_autonomous::{
    autonomous_build_unilateral_branch, autonomous_complete_unilateral_exit,
    autonomous_estimate_unilateral_exit_completion, autonomous_exit_candidates_from_snapshot,
    autonomous_unilateral_exit_chain_steps, autonomous_vtxo_list, dedup_vtxo_outpoint_dtos,
    parse_vtxo_outpoints,
};
use super::exit_watch::{
    enrich_unilateral_exit_watch_after_unroll, remove_unilateral_exit_watch_in_wallet_db,
};
use super::mappers::{
    empty_fee_info, map_exit_candidate, map_intent_fee_configured, parse_onchain_address,
    parse_outpoint,
};
use super::pending_exit::clear_pending_unilateral_exit_for_outpoint_in_wallet_db;

/// arkd's indexer can lag behind confirmed unroll broadcasts when marking `is_unrolled`.
/// Unroll post-broadcast poll and completion retry share the same window (~60s).
const OPERATOR_INDEXER_POLL_MAX: u8 = 60;
const OPERATOR_INDEXER_POLL_DELAY: std::time::Duration = std::time::Duration::from_millis(1_000);

const UNROLL_INDEXER_PROGRESS_MESSAGE: &str = "Waiting for operator to index unilateral unroll…";

const UNROLL_ESPLORA_CONFIRMATION_PROGRESS_MESSAGE: &str =
    "Waiting for Esplora to confirm unilateral unroll on-chain…";

pub(crate) const UNROLL_INDEXER_WARNING: &str = "Unroll confirmed on-chain, but the operator indexer has not marked this VTXO as unrolled yet. You can continue; Complete unilateral exit may take longer until the operator catches up.";

#[derive(Debug)]
struct UnrollPollOutcome {
    operator_indexer_confirmed: bool,
    indexer_warning: Option<String>,
}

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
async fn sleep(duration: std::time::Duration) {
    tokio::time::sleep(duration).await;
}

pub(crate) fn operator_vtxo_is_unrolled(vtxo_list: &VtxoList, txid: &str, vout: u32) -> bool {
    let Ok(target_txid) = Txid::from_str(txid) else {
        return false;
    };
    vtxo_list.all().any(|virtual_tx_outpoint| {
        virtual_tx_outpoint.outpoint.txid == target_txid
            && virtual_tx_outpoint.outpoint.vout == vout
            && virtual_tx_outpoint.is_unrolled
            && !virtual_tx_outpoint.is_spent
    })
}

fn resolve_unroll_indexer_poll_timeout(
    on_chain_confirmed: bool,
    vtxo_txid: &str,
) -> ArkResult<UnrollPollOutcome> {
    if on_chain_confirmed {
        Ok(UnrollPollOutcome {
            operator_indexer_confirmed: false,
            indexer_warning: Some(UNROLL_INDEXER_WARNING.to_string()),
        })
    } else {
        Err(ArkWasmError::UnilateralUnrollNotConfirmedOnChain {
            txid: vtxo_txid.to_string(),
        })
    }
}

async fn unroll_branch_confirmed_on_chain<B: Blockchain>(
    blockchain: &B,
    branch_txids: &[Txid],
    published_vtxo_txid: &str,
) -> ArkResult<bool> {
    if let Ok(target_txid) = Txid::from_str(published_vtxo_txid)
        && blockchain.find_tx(&target_txid).await?.is_some()
    {
        return Ok(true);
    }
    for branch_txid in branch_txids {
        if blockchain.find_tx(branch_txid).await?.is_some() {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn poll_unroll_branch_confirmed_on_esplora<F>(
    blockchain: &impl Blockchain,
    branch_txids: &[Txid],
    published_vtxo_txid: &str,
    on_progress: &F,
) -> ArkResult<()>
where
    F: Fn(UnrollProgressEvent),
{
    for attempt in 0..OPERATOR_INDEXER_POLL_MAX {
        if attempt > 0 {
            sleep(OPERATOR_INDEXER_POLL_DELAY).await;
        }
        on_progress(UnrollProgressEvent {
            event_type: UNROLL_EVENT_TYPE_WAIT.to_string(),
            message: UNROLL_ESPLORA_CONFIRMATION_PROGRESS_MESSAGE.to_string(),
            txid: None,
            vtxo_txid: Some(published_vtxo_txid.to_string()),
        });
        if unroll_branch_confirmed_on_chain(blockchain, branch_txids, published_vtxo_txid).await? {
            return Ok(());
        }
    }
    Err(ArkWasmError::UnilateralUnrollNotConfirmedOnChain {
        txid: published_vtxo_txid.to_string(),
    })
}

fn set_vtxo_unrolled_flag_in_snapshot(
    snapshot: &mut OffchainVtxoSnapshot,
    txid: &str,
    vout: u32,
    is_unrolled: bool,
) {
    for record in &mut snapshot.virtual_tx_outpoints {
        if record.txid == txid && record.vout == vout {
            record.is_unrolled = is_unrolled;
        }
    }
}

fn set_vtxo_unrolled_flag_in_wallet_db(
    wallet_db: &JsonPersistenceDb,
    txid: &str,
    vout: u32,
    is_unrolled: bool,
) {
    let Some(mut snapshot) = wallet_db.snapshot().offchain_vtxo_snapshot.clone() else {
        return;
    };
    set_vtxo_unrolled_flag_in_snapshot(&mut snapshot, txid, vout, is_unrolled);
    wallet_db.set_offchain_vtxo_snapshot(snapshot);
}

fn revert_unilateral_unroll_local_state_in_wallet_db(
    wallet_db: &JsonPersistenceDb,
    txid: &str,
    vout: u32,
) {
    set_vtxo_unrolled_flag_in_wallet_db(wallet_db, txid, vout, false);
    clear_pending_unilateral_exit_for_outpoint_in_wallet_db(wallet_db, txid, vout);
    remove_unilateral_exit_watch_in_wallet_db(wallet_db, txid, vout);
}

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
        let watches = self.wallet_db.unilateral_exit_watches();
        unilateral_exit_in_progress_outpoints(snapshot, &pending, &watches)
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
        if self.autonomous_mode() {
            return autonomous_exit_candidates_from_snapshot(self, &in_progress);
        }
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

        let (vtxo_list, _) = if self.autonomous_mode() {
            autonomous_vtxo_list(self).map(|list| (list, HashMap::new()))?
        } else {
            self.client.list_vtxos().await?
        };
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
        let watches = wallet_snapshot.unilateral_exit_watches;

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
                txid: txid.clone(),
                vout,
                amount_sats: watches
                    .iter()
                    .find(|watch| watch.vtxo_txid == txid && watch.vout == vout)
                    .map(|watch| watch.amount_sats)
                    .unwrap_or_else(|| Self::pending_unilateral_amount_sats(&pending, &outpoint)),
                virtual_status_state: "unrolled".to_string(),
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
        self.ensure_operator_rpc_allowed()?;
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
        self.ensure_operator_rpc_allowed()?;
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

        match if self.autonomous_mode() {
            autonomous_unilateral_exit_chain_steps(self, &params.txid, params.vout).map(|steps| {
                chain_tx_count = steps.chain_tx_count;
                projected_unroll_steps = steps.projected_unroll_steps;
                projected_wait_steps = steps.projected_wait_steps;
            })
        } else {
            self.client
                .get_vtxo_chain(outpoint)
                .await
                .map(|chain| {
                    if let Some(chain) = chain {
                        chain_tx_count = chain.chains.inner.len() as u32;
                        projected_unroll_steps = chain_tx_count.saturating_sub(1);
                        projected_wait_steps = chain
                            .chains
                            .inner
                            .iter()
                            .map(|link| link.spends.len())
                            .sum::<usize>() as u32;
                    } else {
                        estimate_error = Some("VTXO chain not found".to_string());
                    }
                })
                .map_err(ArkWasmError::Client)
        } {
            Ok(()) => {}
            Err(ArkWasmError::AutonomousExitMaterialsMissing) => {
                estimate_error = Some("Exit materials not prefetched for this VTXO".to_string());
            }
            Err(ArkWasmError::Client(error)) => {
                estimate_error = Some(error.to_string());
            }
            Err(error) => return Err(error),
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
        let mut branch_txids = Vec::new();

        for parent_tx in branch {
            let parent_txid = parent_tx.compute_txid();
            branch_txids.push(parent_txid);
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

        if self.autonomous_mode() {
            poll_unroll_branch_confirmed_on_esplora(
                self.client.blockchain(),
                &branch_txids,
                &done_vtxo_txid,
                &on_progress,
            )
            .await
            .inspect_err(|error| {
                if matches!(
                    error,
                    ArkWasmError::UnilateralUnrollNotConfirmedOnChain { .. }
                ) && pending_unilateral_exit_recorded
                {
                    self.revert_unilateral_unroll_local_state(txid, vout);
                }
            })?;
        }

        self.mark_vtxo_unrolled_in_snapshot(txid, vout)?;
        let poll_outcome = if self.autonomous_mode() {
            UnrollPollOutcome {
                operator_indexer_confirmed: false,
                indexer_warning: None,
            }
        } else {
            self.poll_operator_unrolled_indexed(
                txid,
                vout,
                &branch_txids,
                &done_vtxo_txid,
                &on_progress,
            )
            .await
            .inspect_err(|error| {
                if matches!(
                    error,
                    ArkWasmError::UnilateralUnrollNotConfirmedOnChain { .. }
                ) {
                    self.revert_unilateral_unroll_local_state(txid, vout);
                }
            })?
        };

        self.persist_unilateral_exit_watch_after_unroll(txid, vout, &done_vtxo_txid, &branch_txids);

        on_progress(UnrollProgressEvent {
            event_type: UNROLL_EVENT_TYPE_DONE.to_string(),
            message: format!("Unroll complete for {done_vtxo_txid}"),
            txid: None,
            vtxo_txid: Some(done_vtxo_txid.clone()),
        });

        Ok(UnrollResult {
            vtxo_txid: done_vtxo_txid.clone(),
            operator_indexer_confirmed: poll_outcome.operator_indexer_confirmed,
            indexer_warning: poll_outcome.indexer_warning,
        })
    }

    fn persist_unilateral_exit_watch_after_unroll(
        &self,
        txid: &str,
        vout: u32,
        published_vtxo_txid: &str,
        branch_txids: &[Txid],
    ) {
        enrich_unilateral_exit_watch_after_unroll(
            &self.wallet_db,
            txid,
            vout,
            published_vtxo_txid,
            branch_txids,
        );
    }

    async fn poll_operator_unrolled_indexed<F>(
        &self,
        txid: &str,
        vout: u32,
        branch_txids: &[Txid],
        published_vtxo_txid: &str,
        on_progress: &F,
    ) -> ArkResult<UnrollPollOutcome>
    where
        F: Fn(UnrollProgressEvent),
    {
        for attempt in 0..OPERATOR_INDEXER_POLL_MAX {
            if attempt > 0 {
                sleep(OPERATOR_INDEXER_POLL_DELAY).await;
            }
            on_progress(UnrollProgressEvent {
                event_type: UNROLL_EVENT_TYPE_INDEXER.to_string(),
                message: UNROLL_INDEXER_PROGRESS_MESSAGE.to_string(),
                txid: None,
                vtxo_txid: None,
            });
            let vtxo_list = match self.sync_with_operator_and_vtxo_list().await {
                Ok((vtxo_list, _sync_result)) => vtxo_list,
                Err(_) => self.client.list_vtxos().await?.0,
            };
            if operator_vtxo_is_unrolled(&vtxo_list, txid, vout) {
                return Ok(UnrollPollOutcome {
                    operator_indexer_confirmed: true,
                    indexer_warning: None,
                });
            }
        }

        let on_chain_confirmed = unroll_branch_confirmed_on_chain(
            self.client.blockchain(),
            branch_txids,
            published_vtxo_txid,
        )
        .await?;
        resolve_unroll_indexer_poll_timeout(on_chain_confirmed, published_vtxo_txid)
    }

    fn mark_vtxo_unrolled_in_snapshot(&self, txid: &str, vout: u32) -> ArkResult<()> {
        // Local reclassification: VTXO leaves gross spendable (exiting sub-bucket).
        // unilateral_exit_in_progress then counts it from exiting — must not subtract again in
        // build_arkade_balance_dto. See docs/arkade-bitboard-wallet-model.md.
        set_vtxo_unrolled_flag_in_wallet_db(&self.wallet_db, txid, vout, true);
        Ok(())
    }

    /// Undo optimistic unroll state when neither ASP nor Esplora confirms the broadcast.
    pub(crate) fn revert_unilateral_unroll_local_state(&self, txid: &str, vout: u32) {
        revert_unilateral_unroll_local_state_in_wallet_db(&self.wallet_db, txid, vout);
    }

    pub async fn complete_unilateral_exit(
        &self,
        params: CompleteUnilateralExitParams,
    ) -> ArkResult<String> {
        if params.vtxo_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }

        let deduped_vtxo_outpoints = dedup_vtxo_outpoint_dtos(params.vtxo_outpoints);

        let in_progress = self.unilateral_exit_in_progress_outpoints()?;
        for dto in &deduped_vtxo_outpoints {
            let parsed_outpoint = parse_outpoint(&dto.txid, dto.vout)?;
            if !in_progress.contains(&parsed_outpoint) {
                return Err(ArkWasmError::VtxoNotInUnilateralExit {
                    txid: dto.txid.clone(),
                    vout: dto.vout,
                });
            }
        }

        let destination = parse_onchain_address(&params.destination_address, self.network())?;
        let fee_rate_sat_per_vb =
            resolve_completion_fee_rate_sat_per_vb(params.fee_rate_sat_per_vb);
        if self.autonomous_mode() {
            return autonomous_complete_unilateral_exit(
                self,
                &deduped_vtxo_outpoints,
                destination,
                fee_rate_sat_per_vb,
            )
            .await;
        }

        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let dust = self.client.server_info()?.dust;
        for dto in &deduped_vtxo_outpoints {
            let parsed_outpoint = parse_outpoint(&dto.txid, dto.vout)?;
            let Some(virtual_tx_outpoint) = vtxo_list
                .all()
                .find(|virtual_tx_outpoint| virtual_tx_outpoint.outpoint == parsed_outpoint)
            else {
                return Err(ArkWasmError::VtxoUnilateralExitNotReady {
                    txid: dto.txid.clone(),
                    vout: dto.vout,
                });
            };
            let candidate = map_exit_candidate(virtual_tx_outpoint, dust);
            if !candidate.can_complete {
                return Err(ArkWasmError::VtxoUnilateralExitNotReady {
                    txid: dto.txid.clone(),
                    vout: dto.vout,
                });
            }
        }

        let vtxo_outpoints = parse_vtxo_outpoints(&deduped_vtxo_outpoints)?;

        let mut last_error: Option<ark_client::Error> = None;
        for _ in 0..OPERATOR_INDEXER_POLL_MAX {
            self.sync_with_operator().await?;
            match self
                .client
                .send_on_chain_for_vtxo_outpoints(
                    destination.clone(),
                    &vtxo_outpoints,
                    Some(fee_rate_sat_per_vb),
                )
                .await
            {
                Ok(txid) => {
                    self.clear_pending_unilateral_exits_for_outpoints(&vtxo_outpoints);
                    return Ok(txid.to_string());
                }
                Err(error) if completion_awaits_unrolled_indexer(&error) => {
                    last_error = Some(error);
                    sleep(OPERATOR_INDEXER_POLL_DELAY).await;
                }
                Err(error) => return Err(error.into()),
            }
        }

        Err(last_error
            .map(Into::into)
            .unwrap_or(ArkWasmError::OperatorIndexerCatchingUp))
    }

    pub async fn estimate_unilateral_exit_completion(
        &self,
        params: UnilateralExitCompletionFeeEstimateParams,
    ) -> ArkResult<UnilateralExitCompletionFeeEstimateDto> {
        if params.vtxo_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
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
                    missing_blocktime_inputs: Vec::new(),
                });
            }
        };

        let deduped_vtxo_outpoints = dedup_vtxo_outpoint_dtos(params.vtxo_outpoints);

        let vtxo_outpoints = match parse_vtxo_outpoints(&deduped_vtxo_outpoints) {
            Ok(outpoints) => outpoints,
            Err(error) => {
                return Ok(UnilateralExitCompletionFeeEstimateDto {
                    selected_total_sats: 0,
                    estimated_fee_sats: 0,
                    estimated_receive_sats: 0,
                    fee_rate_sat_per_vb: MIN_FEE_RATE_SAT_PER_VB,
                    estimate_error: Some(error.to_string()),
                    missing_blocktime_inputs: Vec::new(),
                });
            }
        };

        let fee_rate_sat_per_vb =
            resolve_completion_fee_rate_sat_per_vb(params.fee_rate_sat_per_vb);

        if self.autonomous_mode() {
            match autonomous_estimate_unilateral_exit_completion(
                self,
                &deduped_vtxo_outpoints,
                destination,
                fee_rate_sat_per_vb,
            )
            .await
            {
                Ok((fee, to_amount, selected_amount, missing_blocktime_inputs)) => {
                    return Ok(UnilateralExitCompletionFeeEstimateDto {
                        selected_total_sats: selected_amount.to_sat(),
                        estimated_fee_sats: fee.to_sat(),
                        estimated_receive_sats: to_amount.to_sat(),
                        fee_rate_sat_per_vb,
                        estimate_error: None,
                        missing_blocktime_inputs: map_missing_blocktime_completion_inputs(
                            &missing_blocktime_inputs,
                        ),
                    });
                }
                Err(error) => {
                    return Ok(UnilateralExitCompletionFeeEstimateDto {
                        selected_total_sats: 0,
                        estimated_fee_sats: 0,
                        estimated_receive_sats: 0,
                        fee_rate_sat_per_vb,
                        estimate_error: Some(error.to_string()),
                        missing_blocktime_inputs: Vec::new(),
                    });
                }
            }
        }

        match self
            .client
            .estimate_send_on_chain_for_vtxo_outpoints(
                destination,
                &vtxo_outpoints,
                Some(fee_rate_sat_per_vb),
            )
            .await
        {
            Ok((fee, to_amount, selected_amount, missing_blocktime_inputs)) => {
                Ok(UnilateralExitCompletionFeeEstimateDto {
                    selected_total_sats: selected_amount.to_sat(),
                    estimated_fee_sats: fee.to_sat(),
                    estimated_receive_sats: to_amount.to_sat(),
                    fee_rate_sat_per_vb,
                    estimate_error: None,
                    missing_blocktime_inputs: map_missing_blocktime_completion_inputs(
                        &missing_blocktime_inputs,
                    ),
                })
            }
            Err(error) => Ok(UnilateralExitCompletionFeeEstimateDto {
                selected_total_sats: 0,
                estimated_fee_sats: 0,
                estimated_receive_sats: 0,
                fee_rate_sat_per_vb,
                estimate_error: Some(error.to_string()),
                missing_blocktime_inputs: Vec::new(),
            }),
        }
    }

    async fn build_unilateral_branch(
        &self,
        target: OutPoint,
    ) -> ArkResult<Vec<bitcoin::Transaction>> {
        if self.autonomous_mode() {
            return autonomous_build_unilateral_branch(self, target).await;
        }
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

fn map_missing_blocktime_completion_inputs(
    inputs: &[ark_client::MissingBlocktimeCompletionInput],
) -> Vec<MissingBlocktimeCompletionInputDto> {
    inputs
        .iter()
        .map(|input| MissingBlocktimeCompletionInputDto {
            virtual_txid: input.virtual_txid.to_string(),
            on_chain_txid: input.on_chain_outpoint.txid.to_string(),
            on_chain_vout: input.on_chain_outpoint.vout,
            amount_sats: input.amount_sats,
        })
        .collect()
}

#[cfg(test)]
mod collaborative_exit_estimate_tests {
    use super::{
        collaborative_exit_estimate_error_code, completion_awaits_unrolled_indexer,
        map_missing_blocktime_completion_inputs, resolve_completion_fee_rate_sat_per_vb,
        resolve_cooperative_exit_amount,
    };
    use crate::api_types::COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS;
    use ark_client::MissingBlocktimeCompletionInput;
    use bitcoin::hashes::Hash;
    use bitcoin::{Amount, OutPoint, Txid};

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

    #[test]
    fn completion_awaits_unrolled_indexer_matches_coin_select_message() {
        let error = ark_client::Error::wallet("no matching unrolled VTXOs found for completion");
        assert!(completion_awaits_unrolled_indexer(&error));
    }

    #[test]
    fn map_missing_blocktime_completion_inputs_maps_virtual_and_on_chain_fields() {
        let virtual_txid = Txid::from_byte_array([0xab; 32]);
        let on_chain_txid = Txid::from_byte_array([0xcd; 32]);
        let mapped = map_missing_blocktime_completion_inputs(&[MissingBlocktimeCompletionInput {
            virtual_txid,
            on_chain_outpoint: OutPoint {
                txid: on_chain_txid,
                vout: 2,
            },
            amount_sats: 150_000,
        }]);
        assert_eq!(mapped.len(), 1);
        assert_eq!(mapped[0].virtual_txid, virtual_txid.to_string());
        assert_eq!(mapped[0].on_chain_txid, on_chain_txid.to_string());
        assert_eq!(mapped[0].on_chain_vout, 2);
        assert_eq!(mapped[0].amount_sats, 150_000);
    }
}

#[cfg(test)]
mod unroll_indexer_poll_tests {
    use super::{
        UNROLL_INDEXER_WARNING, operator_vtxo_is_unrolled, resolve_unroll_indexer_poll_timeout,
    };
    use ark_core::server::VirtualTxOutPoint;
    use bitcoin::hashes::Hash;
    use bitcoin::{Amount, OutPoint, ScriptBuf, Txid};

    fn sample_vtp(txid_byte: u8, is_unrolled: bool, is_spent: bool) -> VirtualTxOutPoint {
        VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([txid_byte; 32]), 0),
            created_at: 0,
            expires_at: 9_999_999_999,
            amount: Amount::from_sat(10_000),
            script: ScriptBuf::new(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled,
            is_spent,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        }
    }

    #[test]
    fn operator_vtxo_is_unrolled_detects_flag() {
        let txid = Txid::from_byte_array([0x11; 32]);
        let vtxo_list = ark_core::VtxoList::new(
            Amount::from_sat(330),
            vec![
                sample_vtp(0x11, true, false),
                sample_vtp(0x22, false, false),
            ],
        );
        assert!(operator_vtxo_is_unrolled(&vtxo_list, &txid.to_string(), 0));
        assert!(!operator_vtxo_is_unrolled(
            &vtxo_list,
            &Txid::from_byte_array([0x22; 32]).to_string(),
            0
        ));
    }

    #[test]
    fn operator_vtxo_is_unrolled_ignores_spent() {
        let txid = Txid::from_byte_array([0x33; 32]);
        let vtxo_list =
            ark_core::VtxoList::new(Amount::from_sat(330), vec![sample_vtp(0x33, true, true)]);
        assert!(!operator_vtxo_is_unrolled(&vtxo_list, &txid.to_string(), 0));
    }

    #[test]
    fn timeout_graceful_when_on_chain_confirmed() {
        let outcome =
            resolve_unroll_indexer_poll_timeout(true, "deadbeef").expect("graceful timeout");
        assert!(!outcome.operator_indexer_confirmed);
        assert_eq!(
            outcome.indexer_warning.as_deref(),
            Some(UNROLL_INDEXER_WARNING)
        );
    }

    #[test]
    fn timeout_errors_when_chain_missing() {
        let error = resolve_unroll_indexer_poll_timeout(false, "deadbeef").unwrap_err();
        assert!(matches!(
            error,
            crate::error::ArkWasmError::UnilateralUnrollNotConfirmedOnChain { txid } if txid == "deadbeef"
        ));
    }
}

#[cfg(test)]
mod unroll_hard_failure_rollback_tests {
    use super::{
        revert_unilateral_unroll_local_state_in_wallet_db, set_vtxo_unrolled_flag_in_wallet_db,
    };
    use crate::persistence::{
        JsonPersistenceDb, OffchainVtxoSnapshot, PendingExitDeductionRecord, PendingExitKind,
        VirtualTxOutPointRecord,
    };
    use crate::session::exit_watch::register_unilateral_exit_watch;
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;

    fn sample_snapshot(txid_byte: u8, is_unrolled: bool) -> OffchainVtxoSnapshot {
        let txid = Txid::from_byte_array([txid_byte; 32]).to_string();
        OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![VirtualTxOutPointRecord {
                txid,
                vout: 0,
                created_at: 0,
                expires_at: 9_999_999_999,
                amount_sats: 50_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled,
                is_spent: false,
                spent_by: None,
                commitment_txids: vec![],
                settled_by: None,
                ark_txid: None,
                assets: vec![],
                server_pk_hex: None,
                unilateral_exit_materials: None,
            }],
        }
    }

    #[test]
    fn hard_failure_rollback_restores_snapshot_and_pending_exit_state() {
        let wallet_db = JsonPersistenceDb::default();
        let txid = Txid::from_byte_array([0x77; 32]).to_string();
        wallet_db.set_offchain_vtxo_snapshot(sample_snapshot(0x77, false));
        wallet_db.upsert_pending_exit_deduction(PendingExitDeductionRecord {
            kind: PendingExitKind::Unilateral,
            vtxo_txid: Some(txid.clone()),
            vout: Some(0),
            amount_sats: 50_000,
            started_at: 1,
            baseline_offchain_spendable_sats: None,
        });
        register_unilateral_exit_watch(&wallet_db, &txid, 0, 50_000);

        set_vtxo_unrolled_flag_in_wallet_db(&wallet_db, &txid, 0, true);
        assert!(
            wallet_db
                .snapshot()
                .offchain_vtxo_snapshot
                .as_ref()
                .expect("snapshot")
                .virtual_tx_outpoints[0]
                .is_unrolled
        );
        assert_eq!(wallet_db.pending_exit_deductions().len(), 1);

        revert_unilateral_unroll_local_state_in_wallet_db(&wallet_db, &txid, 0);

        let snapshot = wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .expect("snapshot after rollback");
        assert!(!snapshot.virtual_tx_outpoints[0].is_unrolled);
        assert!(wallet_db.pending_exit_deductions().is_empty());
        assert!(wallet_db.unilateral_exit_watches().is_empty());
    }
}
