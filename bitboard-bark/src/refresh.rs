//! Whether a sync should submit a new delegated VTXO refresh.
//!
//! Bark resumes a stored delegated round inside `Wallet::sync`. A second
//! submission while one is still pending would spend the same coins twice.

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

#[cfg(test)]
mod tests {
    use super::{
        BARK_REFRESH_IDLE, BARK_REFRESH_PENDING, BARK_REFRESH_SCHEDULED, BARK_REFRESH_WARNING,
        refresh_status_after_schedule, should_schedule_delegated_refresh,
    };

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
