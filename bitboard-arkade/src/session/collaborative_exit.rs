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
        let fees = self
            .client
            .server_info_snapshot()?
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
                    change_sats: None,
                    estimate_error: Some(error.to_string()),
                    estimate_error_code: None,
                });
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
            Ok(settlement) => Ok(CollaborativeExitFeeEstimateDto {
                tx_fee_rate: fees.tx_fee_rate,
                intent_fee_configured,
                estimated_total_fee_sats: Some(settlement.reserved_fee.to_sat()),
                estimated_receive_sats: Some(settlement.onchain_amount.to_sat()),
                change_sats: Some(settlement.change_amount.to_sat()),
                estimate_error: None,
                estimate_error_code: None,
            }),
            Err(error) => {
                let (estimate_error, estimate_error_code) =
                    collaborative_exit_estimate_error_fields(error);
                Ok(CollaborativeExitFeeEstimateDto {
                    tx_fee_rate: fees.tx_fee_rate,
                    intent_fee_configured,
                    estimated_total_fee_sats: None,
                    estimated_receive_sats: None,
                    change_sats: None,
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
    fn resolve_cooperative_exit_amount_defaults_to_net_cooperative_spendable_for_full_exit() {
        assert_eq!(
            resolve_cooperative_exit_amount(None, 42_000).to_sat(),
            42_000
        );
        assert_eq!(resolve_cooperative_exit_amount(None, 0), Amount::ZERO);
    }
}

#[cfg(test)]
mod mutinynet_intent_fee_cel_tests {
    use ark_fees::Config;
    use ark_fees::Estimator;
    use ark_fees::OffchainInput;
    use ark_fees::VtxoType;

    /// Mutinynet `fees.intentFee.offchainInput` at the time of GitHub #80.
    const MUTINYNET_OFFCHAIN_INPUT_PROGRAM: &str =
        "inputType == 'vtxo' && expiry - now() > 518656.0 ? amount * 0.002 : 0.0";

    /// 2100-01-01T00:00:00Z. Remains more than 518656 seconds ahead of `now()`.
    const VTXO_EXPIRY_INSIDE_MUTINYNET_FEE_WINDOW: i64 = 4_102_444_800;

    fn mutinynet_offchain_input_estimator() -> Estimator {
        Estimator::new(Config {
            intent_offchain_input_program: MUTINYNET_OFFCHAIN_INPUT_PROGRAM.to_string(),
            ..Config::default()
        })
        .expect("Mutinynet offchain-input CEL compiles")
    }

    /// Same fields `eval_offboard_intent_fee` fills in, plus an optional expiry.
    fn vtxo_input(amount: u64, expiry: Option<i64>) -> OffchainInput {
        OffchainInput {
            amount,
            expiry,
            birth: None,
            input_type: VtxoType::Vtxo,
            weight: 1.0,
        }
    }

    /// GitHub #80: a ~10000 sat VTXO was quoted at 20 sats, and the submit path sent 0.
    ///
    /// `eval_offboard_intent_fee` omits expiry. `ark-fees` then uses 0, the Mutinynet window
    /// check fails, and the fee is 0. The same input with its real expiry is `amount * 0.002`
    /// (20 sats on 10000, 4 sats on a 2000 sat input).
    #[test]
    fn mutinynet_offchain_input_cel_is_zero_without_expiry() {
        let estimator = mutinynet_offchain_input_estimator();

        let missing_expiry = estimator
            .eval_offchain_input(vtxo_input(10_000, None))
            .expect("missing expiry evaluates");
        assert_eq!(missing_expiry.to_satoshis(), 0);

        let ten_thousand_sat_vtxo = estimator
            .eval_offchain_input(vtxo_input(
                10_000,
                Some(VTXO_EXPIRY_INSIDE_MUTINYNET_FEE_WINDOW),
            ))
            .expect("future expiry evaluates");
        assert_eq!(ten_thousand_sat_vtxo.to_satoshis(), 20);

        let two_thousand_sat_vtxo = estimator
            .eval_offchain_input(vtxo_input(
                2_000,
                Some(VTXO_EXPIRY_INSIDE_MUTINYNET_FEE_WINDOW),
            ))
            .expect("smaller input evaluates");
        assert_eq!(two_thousand_sat_vtxo.to_satoshis(), 4);
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
