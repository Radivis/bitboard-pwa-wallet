//! Whether a sync should submit a new delegated VTXO refresh.
//!
//! Bark resumes a stored delegated round inside `Wallet::sync`. A second
//! submission while one is still pending would spend the same coins twice.
//!
//! When maintenance refresh stays idle, spendable dust can still be
//! consolidated into one delegated refresh if some set meets the VTXO dust
//! minimum after the refresh fee. A coin the server rejects is left out and
//! the rest are submitted. An exit-locked coin inside the refresh window keeps
//! the exit warning on the card while that consolidation still runs.

use bitcoin_ext::{BlockDelta, BlockHeight};
use serde::Serialize;

pub const BARK_REFRESH_IDLE: &str = "idle";
pub const BARK_REFRESH_SCHEDULED: &str = "scheduled";
pub const BARK_REFRESH_PENDING: &str = "pending";
pub const BARK_REFRESH_WARNING: &str = "warning";
pub const BARK_REFRESH_EXIT_BLOCKED: &str = "exit_blocked";

/// One consolidation drops server-rejected inputs and submits again, up to this many times.
/// The same bound Bark uses for a maintenance refresh.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub const DUST_CONSOLIDATION_REJECTION_ATTEMPTS: usize = 10;

/// True when `tip_height` is inside Bark's must-refresh expiry window.
/// Bark refreshes once the tip is past `expiry_height - refresh_expiry_threshold`.
/// An already-expired coin is inside that window.
pub fn vtxo_is_inside_refresh_expiry_window(
    tip_height: BlockHeight,
    expiry_height: BlockHeight,
    refresh_expiry_threshold: BlockDelta,
) -> bool {
    tip_height > expiry_height.saturating_sub(refresh_expiry_threshold)
}

/// Pending rounds already cover the coins Bark would refresh. Skip scheduling.
pub fn should_schedule_delegated_refresh(pending_round_count: usize) -> bool {
    pending_round_count == 0
}

/// `true` when `maybe_schedule_maintenance_refresh_delegated` stored a round.
pub fn refresh_status_after_schedule(scheduled_round: bool) -> &'static str {
    if scheduled_round {
        BARK_REFRESH_SCHEDULED
    } else {
        BARK_REFRESH_IDLE
    }
}

/// Dust consolidation runs after maintenance refresh found nothing due.
/// A pending round, a scheduled refresh, or a warning already owns the status
/// the card shows. An exit block is handled by the caller: it consolidates
/// spendable dust and keeps the exit warning.
pub fn should_schedule_dust_consolidation(maintenance_refresh_status: &str) -> bool {
    maintenance_refresh_status == BARK_REFRESH_IDLE
}

/// A stored round reports `pending`. An exit-locked coin inside the refresh
/// window keeps the exit warning on the card while that round is still open.
pub fn refresh_status_for_pending_round(exit_blocks_refresh: bool) -> &'static str {
    if exit_blocks_refresh {
        BARK_REFRESH_EXIT_BLOCKED
    } else {
        BARK_REFRESH_PENDING
    }
}

/// Indexes of `(amount_sats, marginal_fee_sats)` to keep.
///
/// The full set is kept when its amount, after `base_fee_sats` and each coin's
/// fee, is at least `dust_sats`. Otherwise a coin whose own fee exceeds its
/// amount is dropped, worst first, until the rest can pay. A set that still
/// cannot pay, or whose amount is below `dust_sats`, keeps nothing.
pub fn payable_dust_indexes(
    coins: &[(u64, u64)],
    base_fee_sats: u64,
    dust_sats: u64,
) -> Vec<usize> {
    let mut kept = (0..coins.len()).collect::<Vec<_>>();
    loop {
        if kept.is_empty() {
            return Vec::new();
        }
        let total_amount = sat_sum(kept.iter().map(|index| coins[*index].0));
        if total_amount < dust_sats {
            return Vec::new();
        }
        let marginal_fees = sat_sum(kept.iter().map(|index| coins[*index].1));
        let fee = base_fee_sats.saturating_add(marginal_fees);
        if total_amount.saturating_sub(fee) >= dust_sats {
            return kept;
        }
        let Some(worst_index) = worst_fee_over_amount(coins, &kept) else {
            return Vec::new();
        };
        let (amount_sats, marginal_fee_sats) = coins[worst_index];
        if marginal_fee_sats <= amount_sats {
            return Vec::new();
        }
        kept.retain(|index| *index != worst_index);
    }
}

fn sat_sum(amounts: impl Iterator<Item = u64>) -> u64 {
    amounts.fold(0u64, u64::saturating_add)
}

fn worst_fee_over_amount(coins: &[(u64, u64)], kept: &[usize]) -> Option<usize> {
    kept.iter().copied().max_by_key(|index| {
        let (amount_sats, marginal_fee_sats) = coins[*index];
        marginal_fee_sats.saturating_sub(amount_sats)
    })
}

/// `dust_amounts_sats` are spendable coins already below the VTXO dust limit.
/// Their sum has to reach that limit before a round can pay for one output.
pub fn dust_total_meets_vtxo_dust(dust_amounts_sats: impl IntoIterator<Item = u64>) -> bool {
    let total_sats = dust_amounts_sats
        .into_iter()
        .fold(0u64, u64::saturating_add);
    total_sats >= bark::ark::vtxo::VTXO_DUST_SAT
}

/// `scheduled` when a round was stored. A missing round, or a refresh fee that
/// cannot leave a non-dust output, stays `idle`. Any other error is `warning`.
pub fn refresh_status_after_dust_consolidation(
    scheduled_round: Result<bool, &anyhow::Error>,
) -> &'static str {
    match scheduled_round {
        Ok(true) => BARK_REFRESH_SCHEDULED,
        Ok(false) => BARK_REFRESH_IDLE,
        Err(err) if refresh_fee_rejects_dust_consolidation(err) => BARK_REFRESH_IDLE,
        Err(_) => BARK_REFRESH_WARNING,
    }
}

fn refresh_fee_rejects_dust_consolidation(err: &anyhow::Error) -> bool {
    err.chain().any(|cause| {
        cause
            .downcast_ref::<bark::ark::fees::FeeValidationError>()
            .is_some()
    })
}

/// `{"tipHeight":..,"nextRefreshHeight":..}`, or `null` when the tip or the
/// required refresh height is unknown.
///
/// Bark must refresh once `tip > required_refresh_height`, so the refresh
/// period starts one block after that height.
pub fn next_refresh_schedule_json(
    tip_height: Option<BlockHeight>,
    required_refresh_height: Option<BlockHeight>,
) -> Result<String, String> {
    let schedule = match (tip_height, required_refresh_height) {
        (Some(tip_height), Some(required_refresh_height)) => Some(NextRefreshScheduleJson {
            tip_height,
            next_refresh_height: required_refresh_height + BlockDelta::new(1),
        }),
        _ => None,
    };
    serde_json::to_string(&schedule).map_err(|err| err.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NextRefreshScheduleJson {
    tip_height: BlockHeight,
    next_refresh_height: BlockHeight,
}

#[cfg(test)]
mod tests {
    use bark::ark::fees::FeeValidationError;
    use bark::ark::vtxo::{VTXO_DUST, VTXO_DUST_SAT};
    use bitcoin::Amount;

    use bitcoin_ext::{BlockDelta, BlockHeight};

    use super::{
        BARK_REFRESH_EXIT_BLOCKED, BARK_REFRESH_IDLE, BARK_REFRESH_PENDING, BARK_REFRESH_SCHEDULED,
        BARK_REFRESH_WARNING, dust_total_meets_vtxo_dust, next_refresh_schedule_json,
        payable_dust_indexes, refresh_status_after_dust_consolidation,
        refresh_status_after_schedule, refresh_status_for_pending_round,
        should_schedule_delegated_refresh, should_schedule_dust_consolidation,
        vtxo_is_inside_refresh_expiry_window,
    };

    #[test]
    fn next_refresh_schedule_starts_one_block_after_the_required_height() {
        assert_eq!(
            next_refresh_schedule_json(
                Some(BlockHeight::new(1_000)),
                Some(BlockHeight::new(1_100))
            )
            .unwrap(),
            r#"{"tipHeight":1000,"nextRefreshHeight":1101}"#
        );
    }

    #[test]
    fn next_refresh_schedule_is_null_without_a_tip_or_a_required_height() {
        assert_eq!(
            next_refresh_schedule_json(None, Some(BlockHeight::new(1_100))).unwrap(),
            "null"
        );
        assert_eq!(
            next_refresh_schedule_json(Some(BlockHeight::new(1_000)), None).unwrap(),
            "null"
        );
        assert_eq!(next_refresh_schedule_json(None, None).unwrap(), "null");
    }

    #[test]
    fn next_refresh_schedule_reports_a_period_that_already_started() {
        assert_eq!(
            next_refresh_schedule_json(
                Some(BlockHeight::new(1_200)),
                Some(BlockHeight::new(1_100))
            )
            .unwrap(),
            r#"{"tipHeight":1200,"nextRefreshHeight":1101}"#
        );
    }

    #[test]
    fn pending_rounds_skip_a_new_delegated_refresh() {
        assert!(should_schedule_delegated_refresh(0));
        assert!(!should_schedule_delegated_refresh(1));
        assert!(!should_schedule_delegated_refresh(3));
    }

    #[test]
    fn an_empty_selector_stays_idle_and_a_stored_round_is_scheduled() {
        assert_eq!(refresh_status_after_schedule(false), BARK_REFRESH_IDLE);
        assert_eq!(refresh_status_after_schedule(true), BARK_REFRESH_SCHEDULED);
    }

    #[test]
    fn dust_consolidation_runs_only_after_an_idle_maintenance_refresh() {
        assert!(should_schedule_dust_consolidation(BARK_REFRESH_IDLE));
        assert!(!should_schedule_dust_consolidation(BARK_REFRESH_SCHEDULED));
        assert!(!should_schedule_dust_consolidation(BARK_REFRESH_PENDING));
        assert!(!should_schedule_dust_consolidation(BARK_REFRESH_WARNING));
        assert!(!should_schedule_dust_consolidation(
            BARK_REFRESH_EXIT_BLOCKED
        ));
    }

    #[test]
    fn a_pending_round_keeps_the_exit_warning_when_an_exit_blocks_refresh() {
        assert_eq!(
            refresh_status_for_pending_round(false),
            BARK_REFRESH_PENDING
        );
        assert_eq!(
            refresh_status_for_pending_round(true),
            BARK_REFRESH_EXIT_BLOCKED
        );
    }

    #[test]
    fn a_dust_total_below_the_vtxo_minimum_is_not_consolidated() {
        let below_dust = VTXO_DUST_SAT.saturating_sub(1);
        assert!(!dust_total_meets_vtxo_dust([]));
        assert!(!dust_total_meets_vtxo_dust([below_dust]));
        assert!(dust_total_meets_vtxo_dust([below_dust, 1]));
        assert!(dust_total_meets_vtxo_dust([VTXO_DUST_SAT]));
    }

    #[test]
    fn a_payable_dust_set_is_kept_and_a_coin_whose_fee_exceeds_its_amount_is_dropped() {
        let dust_sats = VTXO_DUST_SAT;
        assert_eq!(
            payable_dust_indexes(&[(200, 1), (200, 1), (200, 1)], 50, dust_sats),
            vec![0, 1, 2]
        );
        assert_eq!(
            payable_dust_indexes(&[(400, 1), (200, 500)], 0, dust_sats),
            vec![0]
        );
        assert_eq!(
            payable_dust_indexes(&[(500, 1), (400, 900), (400, 800)], 0, dust_sats),
            vec![0]
        );
        assert!(payable_dust_indexes(&[(200, 1), (200, 1)], 100, dust_sats).is_empty());
        assert!(payable_dust_indexes(&[(100, 1)], 0, dust_sats).is_empty());
        assert!(payable_dust_indexes(&[], 0, dust_sats).is_empty());
    }

    #[test]
    fn a_stored_dust_round_is_scheduled_and_an_empty_one_stays_idle() {
        assert_eq!(
            refresh_status_after_dust_consolidation(Ok(true)),
            BARK_REFRESH_SCHEDULED
        );
        assert_eq!(
            refresh_status_after_dust_consolidation(Ok(false)),
            BARK_REFRESH_IDLE
        );
    }

    #[test]
    fn a_refresh_fee_that_leaves_sub_dust_stays_idle() {
        let dust = VTXO_DUST;
        let amount = Amount::from_sat(dust.to_sat().saturating_add(1));
        let fee = Amount::from_sat(2);
        let below_dust = FeeValidationError::AmountAfterFeeBelowDust {
            amount,
            fee,
            dust,
            amount_after_fee: amount - fee,
        };
        let err = anyhow::Error::from(below_dust).context("building the refresh");
        assert_eq!(
            refresh_status_after_dust_consolidation(Err(&err)),
            BARK_REFRESH_IDLE
        );

        let fee_exceeds_amount = anyhow::Error::from(FeeValidationError::FeeExceedsAmount {
            amount,
            fee: amount,
        });
        assert_eq!(
            refresh_status_after_dust_consolidation(Err(&fee_exceeds_amount)),
            BARK_REFRESH_IDLE
        );
    }

    #[test]
    fn any_other_dust_consolidation_error_warns() {
        let err = anyhow::Error::msg("the server rejected the round");
        assert_eq!(
            refresh_status_after_dust_consolidation(Err(&err)),
            BARK_REFRESH_WARNING
        );
    }

    #[test]
    fn refresh_status_codes_stay_stable() {
        assert_eq!(BARK_REFRESH_IDLE, "idle");
        assert_eq!(BARK_REFRESH_SCHEDULED, "scheduled");
        assert_eq!(BARK_REFRESH_PENDING, "pending");
        assert_eq!(BARK_REFRESH_WARNING, "warning");
        assert_eq!(BARK_REFRESH_EXIT_BLOCKED, "exit_blocked");
    }

    #[test]
    fn the_refresh_expiry_window_includes_a_coin_near_or_past_expiry() {
        let expiry_height = BlockHeight::new(20);
        let threshold = BlockDelta::new(12);
        assert!(!vtxo_is_inside_refresh_expiry_window(
            BlockHeight::new(8),
            expiry_height,
            threshold
        ));
        assert!(vtxo_is_inside_refresh_expiry_window(
            BlockHeight::new(9),
            expiry_height,
            threshold
        ));
        assert!(vtxo_is_inside_refresh_expiry_window(
            BlockHeight::new(25),
            expiry_height,
            threshold
        ));
        assert!(!vtxo_is_inside_refresh_expiry_window(
            expiry_height,
            expiry_height,
            BlockDelta::ZERO
        ));
    }
}
