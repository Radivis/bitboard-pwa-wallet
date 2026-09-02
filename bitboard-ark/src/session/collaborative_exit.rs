use std::str::FromStr;

use ark_client::JoinBatchOutcome;
use bitcoin::{Amount, OutPoint, Txid, secp256k1::rand::rngs::OsRng};

use crate::api_types::{
    BatchJoinResultDto, COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS,
    CollaborativeExitFeeEstimateDto, CollaborativeExitParams,
};
use crate::error::ArkResult;
use crate::persistence::PendingBatchIntentKind;

use super::ArkSession;
use super::mappers::{empty_fee_info, map_intent_fee_configured, parse_onchain_address};

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
    pub async fn collaborative_exit(
        &self,
        params: CollaborativeExitParams,
    ) -> ArkResult<BatchJoinResultDto> {
        self.ensure_operator_rpc_allowed()?;
        let overlap_outpoints = self
            .wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .map(|snapshot| {
                snapshot
                    .virtual_tx_outpoints
                    .into_iter()
                    .filter(|row| !row.is_spent)
                    .filter_map(|row| {
                        let txid = Txid::from_str(&row.txid).ok()?;
                        Some(OutPoint {
                            txid,
                            vout: row.vout,
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if let Some(waiting) = self
            .existing_pending_batch_join_result(&[], &overlap_outpoints)
            .await?
        {
            return Ok(waiting);
        }
        let destination = parse_onchain_address(&params.destination_address, self.network())?;
        let buckets = self.resolve_offchain_balance_buckets().await?;
        let baseline_offchain_spendable_sats = buckets.gross_spendable_sats();
        let exit_amount =
            resolve_cooperative_exit_amount(params.amount_sats, baseline_offchain_spendable_sats);
        let mut rng = OsRng;
        let redeem = self
            .with_batch_join(
                PendingBatchIntentKind::CollaborativeExit,
                exit_amount.to_sat(),
                Some(params.destination_address.clone()),
                || async {
                    self.client
                        .collaborative_redeem(&mut rng, destination, exit_amount)
                        .await
                },
            )
            .await;
        match redeem {
            Ok(JoinBatchOutcome::Completed(txid)) => {
                self.record_pending_collaborative_exit(
                    exit_amount.to_sat(),
                    baseline_offchain_spendable_sats,
                );
                Ok(Self::batch_join_completed_result(txid))
            }
            Ok(JoinBatchOutcome::Waiting(intent)) => Ok(self.stamp_registered_intent_timed_out(
                &intent,
                PendingBatchIntentKind::CollaborativeExit,
                exit_amount.to_sat(),
                Some(params.destination_address.clone()),
            )),
            Err(error) => {
                let (onchain_outpoints, vtxo_outpoints) = self
                    .latest_pending_outpoints_for_kind(PendingBatchIntentKind::CollaborativeExit);
                self.map_settle_error(
                    PendingBatchIntentKind::CollaborativeExit,
                    error,
                    &onchain_outpoints,
                    &vtxo_outpoints,
                    exit_amount.to_sat(),
                )
                .await
            }
        }
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
}

#[cfg(test)]
mod collaborative_exit_estimate_tests {
    use super::{collaborative_exit_estimate_error_code, resolve_cooperative_exit_amount};
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
}
