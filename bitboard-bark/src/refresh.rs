//! Whether a sync should submit a new delegated VTXO refresh.
//!
//! Bark resumes a stored delegated round inside `Wallet::sync`. A second
//! submission while one is still pending would spend the same coins twice.

use serde::Serialize;

pub const BARK_REFRESH_IDLE: &str = "idle";
pub const BARK_REFRESH_SCHEDULED: &str = "scheduled";
pub const BARK_REFRESH_PENDING: &str = "pending";
pub const BARK_REFRESH_WARNING: &str = "warning";

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
    use super::{
        BARK_REFRESH_IDLE, BARK_REFRESH_PENDING, BARK_REFRESH_SCHEDULED, BARK_REFRESH_WARNING,
        next_refresh_schedule_json, refresh_status_after_schedule,
        should_schedule_delegated_refresh,
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
        assert_eq!(next_refresh_schedule_json(None, Some(1_100)).unwrap(), "null");
        assert_eq!(next_refresh_schedule_json(Some(1_000), None).unwrap(), "null");
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
    fn refresh_status_codes_stay_stable() {
        assert_eq!(BARK_REFRESH_IDLE, "idle");
        assert_eq!(BARK_REFRESH_SCHEDULED, "scheduled");
        assert_eq!(BARK_REFRESH_PENDING, "pending");
        assert_eq!(BARK_REFRESH_WARNING, "warning");
    }
}
