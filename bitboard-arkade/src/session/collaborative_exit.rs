use std::str::FromStr;

use ark_client::JoinBatchOutcome;
use bitcoin::{Amount, OutPoint, Txid, secp256k1::rand::rngs::OsRng};

use crate::api_types::{
    BatchJoinResultDto, COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS,
    CollaborativeExitFeeEstimateDto, CollaborativeExitParams,
};
use crate::error::ArkResult;
use crate::persistence::PendingBatchIntentKind;

use super::ArkadeSession;
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

/// Explicit exit amount, or net cooperative offchain spendable for a full exit.
fn resolve_cooperative_exit_amount(
    amount_sats: Option<u64>,
    net_cooperative_spendable_sats: u64,
) -> Amount {
    amount_sats
        .map(Amount::from_sat)
        .unwrap_or_else(|| Amount::from_sat(net_cooperative_spendable_sats))
}

impl ArkadeSession {
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
        let baseline_offchain_spendable_sats = self.net_cooperative_spendable_sats().await?;
        let exit_amount =
            resolve_cooperative_exit_amount(params.amount_sats, baseline_offchain_spendable_sats);
        let exclude_vtxos = self.spend_locked_outpoints();
        let mut rng = OsRng;
        let redeem = self
            .with_batch_join(
                PendingBatchIntentKind::CollaborativeExit,
                exit_amount.to_sat(),
                Some(params.destination_address.clone()),
                || async {
                    self.client
                        .collaborative_redeem_excluding_vtxos(
                            &mut rng,
                            destination,
                            exit_amount,
                            &exclude_vtxos,
                        )
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
        let destination = match parse_onchain_address(destination_address, self.network()) {
            Ok(address) => address,
            Err(error) => {
                return self
                    .collaborative_exit_estimate_failure(error.to_string(), None)
                    .await;
            }
        };

        let net_cooperative_spendable_sats = self.net_cooperative_spendable_sats().await?;
        let to_amount =
            resolve_cooperative_exit_amount(amount_sats, net_cooperative_spendable_sats);
        let exclude_vtxos = self.spend_locked_outpoints();

        let mut rng = OsRng;
        match self
            .client
            .quote_collaborative_redeem_excluding_vtxos(
                &mut rng,
                destination,
                to_amount,
                &exclude_vtxos,
            )
            .await
        {
            Ok(quote) => {
                let fees = quote.fees.clone().unwrap_or_else(empty_fee_info);
                Ok(CollaborativeExitFeeEstimateDto {
                    tx_fee_rate: fees.tx_fee_rate,
                    intent_fee_configured: map_intent_fee_configured(&fees.intent_fee),
                    estimated_total_fee_sats: Some(quote.settlement.reserved_fee.to_sat()),
                    estimated_receive_sats: Some(quote.settlement.onchain_amount.to_sat()),
                    change_sats: Some(quote.settlement.change_amount.to_sat()),
                    estimate_error: None,
                    estimate_error_code: None,
                })
            }
            Err(error) => {
                let (estimate_error, estimate_error_code) =
                    collaborative_exit_estimate_error_fields(error);
                self.collaborative_exit_estimate_failure(estimate_error, estimate_error_code)
                    .await
            }
        }
    }

    async fn collaborative_exit_estimate_failure(
        &self,
        estimate_error: String,
        estimate_error_code: Option<&'static str>,
    ) -> ArkResult<CollaborativeExitFeeEstimateDto> {
        let fees = self
            .client
            .server_info()
            .await?
            .fees
            .clone()
            .unwrap_or_else(empty_fee_info);
        Ok(CollaborativeExitFeeEstimateDto {
            tx_fee_rate: fees.tx_fee_rate,
            intent_fee_configured: map_intent_fee_configured(&fees.intent_fee),
            estimated_total_fee_sats: None,
            estimated_receive_sats: None,
            change_sats: None,
            estimate_error: Some(estimate_error),
            estimate_error_code,
        })
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
    fn resolve_cooperative_exit_amount_defaults_to_net_cooperative_spendable_for_full_exit() {
        assert_eq!(
            resolve_cooperative_exit_amount(None, 42_000).to_sat(),
            42_000
        );
        assert_eq!(resolve_cooperative_exit_amount(None, 0), Amount::ZERO);
    }
}

#[cfg(test)]
mod offboard_settlement_tests {
    use ark_client::OffboardPlanError;
    use ark_client::offboard_outputs_for_fee;
    use ark_client::plan_offboard_settlement;
    use bitcoin::Amount;

    const DUST: u64 = 330;

    fn sat(sats: u64) -> Amount {
        Amount::from_sat(sats)
    }

    #[test]
    fn partial_exit_keeps_the_onchain_amount_and_shrinks_change() {
        let settlement = offboard_outputs_for_fee(sat(10_000), sat(2_000), sat(DUST), sat(20))
            .expect("change covers the fee");
        assert_eq!(settlement.onchain_amount, sat(2_000));
        assert_eq!(settlement.change_amount, sat(7_980));
        assert_eq!(settlement.reserved_fee, sat(20));
    }

    #[test]
    fn remainder_equal_to_the_fee_is_a_single_onchain_output() {
        let settlement = offboard_outputs_for_fee(sat(10_000), sat(9_980), sat(DUST), sat(20))
            .expect("remainder is the fee");
        assert_eq!(settlement.onchain_amount, sat(9_980));
        assert_eq!(settlement.change_amount, Amount::ZERO);
        assert_eq!(settlement.reserved_fee, sat(20));
    }

    #[test]
    fn sub_dust_leftover_stays_in_the_reserved_fee() {
        let settlement = offboard_outputs_for_fee(sat(10_000), sat(9_950), sat(DUST), sat(20))
            .expect("sub-dust change folds into the fee");
        assert_eq!(settlement.onchain_amount, sat(9_950));
        assert_eq!(settlement.change_amount, Amount::ZERO);
        assert_eq!(settlement.reserved_fee, sat(50));
    }

    #[test]
    fn full_balance_shrinks_the_onchain_output_by_the_fee() {
        let mut quoted_shapes = Vec::new();
        let settlement =
            plan_offboard_settlement(sat(10_000), sat(10_000), sat(DUST), |onchain, change| {
                quoted_shapes.push((onchain.to_sat(), change.to_sat()));
                Ok::<_, ()>(sat(20))
            })
            .expect("flat fee settles");
        assert_eq!(quoted_shapes, vec![(10_000, 0), (9_980, 0)]);
        assert_eq!(settlement.onchain_amount, sat(9_980));
        assert_eq!(settlement.change_amount, Amount::ZERO);
        assert_eq!(settlement.reserved_fee, sat(20));
    }

    #[test]
    fn onchain_output_below_dust_is_an_error() {
        let error = offboard_outputs_for_fee(sat(400), sat(400), sat(DUST), sat(100))
            .expect_err("300 sat output is below dust");
        assert!(!error.is_coin_select());
        assert!(error.to_string().contains("sub-dust"));
    }

    #[test]
    fn requested_amount_above_the_selected_total_is_an_error() {
        let error = offboard_outputs_for_fee(sat(100), sat(200), sat(DUST), sat(0))
            .expect_err("request exceeds inputs");
        assert!(error.is_coin_select());
    }

    #[test]
    fn flat_fee_is_accepted_on_the_second_quote() {
        let mut quotes = 0;
        let settlement =
            plan_offboard_settlement(sat(10_000), sat(2_000), sat(DUST), |onchain, _change| {
                quotes += 1;
                assert_eq!(onchain, sat(2_000));
                Ok::<_, ()>(sat(20))
            })
            .expect("flat fee settles");
        assert_eq!(quotes, 2);
        assert_eq!(settlement.onchain_amount, sat(2_000));
        assert_eq!(settlement.change_amount, sat(7_980));
        assert_eq!(settlement.reserved_fee, sat(20));
    }

    #[test]
    fn fee_that_drops_the_change_output_is_accepted_after_that_shape_is_quoted() {
        let mut quoted_shapes = Vec::new();
        let settlement =
            plan_offboard_settlement(sat(10_000), sat(9_600), sat(DUST), |onchain, change| {
                quoted_shapes.push((onchain.to_sat(), change.to_sat()));
                let fee = if change > Amount::ZERO { 100 } else { 80 };
                Ok::<_, ()>(sat(fee))
            })
            .expect("single-output quote is covered by the folded remainder");
        assert_eq!(quoted_shapes, vec![(9_600, 400), (9_600, 0)]);
        assert_eq!(settlement.onchain_amount, sat(9_600));
        assert_eq!(settlement.change_amount, Amount::ZERO);
        assert_eq!(settlement.reserved_fee, sat(400));
    }

    #[test]
    fn regtest_intent_fee_reserves_input_percent_plus_flat_onchain_output() {
        let input_sats = 198_000;
        let settlement = plan_offboard_settlement(
            sat(input_sats),
            sat(50_000),
            sat(DUST),
            |onchain, _change| {
                let input_fee = (input_sats as f64 * 0.01).ceil() as u64;
                let onchain_output_fee = if onchain > Amount::ZERO { 250 } else { 0 };
                Ok::<_, ()>(sat(input_fee + onchain_output_fee))
            },
        )
        .expect("regtest fee settles");
        assert_eq!(settlement.onchain_amount, sat(50_000));
        assert_eq!(settlement.reserved_fee, sat(1_980 + 250));
        assert_eq!(settlement.change_amount, sat(input_sats - 50_000 - 2_230));
    }

    #[test]
    fn three_quotes_that_never_cover_the_shape_error() {
        let mut quotes = 0;
        let result =
            plan_offboard_settlement(sat(10_000), sat(2_000), sat(DUST), |_onchain, _change| {
                quotes += 1;
                Ok::<_, ()>(sat(quotes * 100))
            });
        assert!(matches!(result, Err(OffboardPlanError::FeeDidNotStabilize)));
        assert_eq!(quotes, 3);
    }
}
