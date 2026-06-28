use std::str::FromStr;

use ark_client::Blockchain;
use bitcoin::{Amount, OutPoint, Txid, secp256k1::rand::rngs::OsRng};

use crate::api_types::{
    COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS,
    CollaborativeExitFeeEstimateDto, CollaborativeExitParams, CompleteUnilateralExitParams,
    ExitCandidateRow, OnchainBumperInfoDto, UnilateralExitFeeEstimateDto, UnilateralExitFeeParams,
    UnrollProgressEvent, UnrollResult,
};
use crate::constants::{
    MIN_FEE_RATE_SAT_PER_VB, UNILATERAL_EXIT_CHILD_VSIZE_VB, UNROLL_EVENT_TYPE_DONE,
    UNROLL_EVENT_TYPE_UNROLL, UNROLL_EVENT_TYPE_WAIT,
};
use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::gross_offchain_spendable_sats_from_snapshot;

use super::ArkSession;
use super::mappers::{
    empty_fee_info, map_exit_candidate, map_intent_fee_configured, parse_onchain_address,
    parse_outpoint,
};

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

impl ArkSession {
    pub async fn list_exit_candidates(&self) -> ArkResult<Vec<ExitCandidateRow>> {
        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let dust = self.client.server_info()?.dust;
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

        let vtxo_txids: Vec<Txid> = params
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

#[cfg(test)]
mod collaborative_exit_estimate_tests {
    use super::collaborative_exit_estimate_error_code;
    use crate::api_types::COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS;

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
}
