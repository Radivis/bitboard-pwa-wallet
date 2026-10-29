//! Whether a sync should submit a new delegated VTXO refresh.
//!
//! Bark resumes a stored delegated round inside `Wallet::sync`. A second
//! submission while one is still pending would spend the same coins twice.
//!
//! When maintenance refresh stays idle, spendable dust can still be
//! consolidated into one delegated refresh if the total meets the VTXO dust
//! minimum. A refresh fee that would leave a sub-dust output stays idle.

use serde::Serialize;

pub const BARK_REFRESH_IDLE: &str = "idle";
pub const BARK_REFRESH_SCHEDULED: &str = "scheduled";
pub const BARK_REFRESH_PENDING: &str = "pending";
pub const BARK_REFRESH_WARNING: &str = "warning";
pub const BARK_REFRESH_EXIT_BLOCKED: &str = "exit_blocked";

/// True when `tip_height` is inside Bark's must-refresh expiry window.
/// Bark refreshes once the tip is past `expiry_height - refresh_expiry_threshold`.
/// An already-expired coin is inside that window.
pub fn vtxo_is_inside_refresh_expiry_window(
    tip_height: u32,
    expiry_height: u32,
    refresh_expiry_threshold: u32,
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

/// Dust consolidation runs only after maintenance refresh found nothing due.
/// A pending round, a scheduled refresh, a warning, or an exit block already
/// owns the status the card shows.
pub fn should_schedule_dust_consolidation(maintenance_refresh_status: &str) -> bool {
    maintenance_refresh_status == BARK_REFRESH_IDLE
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
    tip_height: Option<u32>,
    required_refresh_height: Option<u32>,
) -> Result<String, String> {
    let schedule = match (tip_height, required_refresh_height) {
        (Some(tip_height), Some(required_refresh_height)) => Some(NextRefreshScheduleJson {
            tip_height,
            next_refresh_height: required_refresh_height.saturating_add(1),
        }),
        _ => None,
    };
    serde_json::to_string(&schedule).map_err(|err| err.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NextRefreshScheduleJson {
    tip_height: u32,
    next_refresh_height: u32,
}

#[cfg(test)]
mod tests {
    use bark::ark::fees::FeeValidationError;
    use bark::ark::vtxo::{VTXO_DUST, VTXO_DUST_SAT};
    use bitcoin::Amount;

    use super::{
        BARK_REFRESH_EXIT_BLOCKED, BARK_REFRESH_IDLE, BARK_REFRESH_PENDING, BARK_REFRESH_SCHEDULED,
        BARK_REFRESH_WARNING, dust_total_meets_vtxo_dust, next_refresh_schedule_json,
        refresh_status_after_dust_consolidation, refresh_status_after_schedule,
        should_schedule_delegated_refresh, should_schedule_dust_consolidation,
        vtxo_is_inside_refresh_expiry_window,
    };

    #[test]
    fn next_refresh_schedule_starts_one_block_after_the_required_height() {
        assert_eq!(
            next_refresh_schedule_json(Some(1_000), Some(1_100)).unwrap(),
            r#"{"tipHeight":1000,"nextRefreshHeight":1101}"#
        );
    }

    #[test]
    fn next_refresh_schedule_is_null_without_a_tip_or_a_required_height() {
        assert_eq!(
            next_refresh_schedule_json(None, Some(1_100)).unwrap(),
            "null"
        );
        assert_eq!(
            next_refresh_schedule_json(Some(1_000), None).unwrap(),
            "null"
        );
        assert_eq!(next_refresh_schedule_json(None, None).unwrap(), "null");
    }

    #[test]
    fn next_refresh_schedule_reports_a_period_that_already_started() {
        assert_eq!(
            next_refresh_schedule_json(Some(1_200), Some(1_100)).unwrap(),
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
    fn a_dust_total_below_the_vtxo_minimum_is_not_consolidated() {
        let below_dust = VTXO_DUST_SAT.saturating_sub(1);
        assert!(!dust_total_meets_vtxo_dust([]));
        assert!(!dust_total_meets_vtxo_dust([below_dust]));
        assert!(dust_total_meets_vtxo_dust([below_dust, 1]));
        assert!(dust_total_meets_vtxo_dust([VTXO_DUST_SAT]));
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
        let expiry_height = 20;
        let threshold = 12;
        assert!(!vtxo_is_inside_refresh_expiry_window(
            8,
            expiry_height,
            threshold
        ));
        assert!(vtxo_is_inside_refresh_expiry_window(
            9,
            expiry_height,
            threshold
        ));
        assert!(vtxo_is_inside_refresh_expiry_window(
            25,
            expiry_height,
            threshold
        ));
        assert!(!vtxo_is_inside_refresh_expiry_window(
            expiry_height,
            expiry_height,
            0
        ));
    }
}
