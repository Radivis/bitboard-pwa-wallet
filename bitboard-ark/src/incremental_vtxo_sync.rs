use crate::persistence::OffchainVtxoSnapshot;

/// How often a background full unfiltered VTXO list may run after a snapshot exists.
pub const FULL_VTXO_LIST_RECONCILE_INTERVAL_SECS: i64 = 15 * 60;

/// User-facing operator sync uses the light fetch whenever a snapshot already exists (ARK-SYNC-04).
pub fn user_facing_operator_sync_uses_light_fetch(snapshot: Option<&OffchainVtxoSnapshot>) -> bool {
    snapshot.is_some()
}

/// Background full list is due when a snapshot exists and the caller asked to schedule one,
/// or `full_listed_at` is older than [`FULL_VTXO_LIST_RECONCILE_INTERVAL_SECS`].
///
/// No snapshot is bootstrap: that path blocks on a full list and does not schedule a second one.
pub fn full_vtxo_list_reconcile_due(
    snapshot: Option<&OffchainVtxoSnapshot>,
    now: i64,
    schedule_background_full: bool,
) -> bool {
    let Some(snapshot) = snapshot else {
        return false;
    };
    if schedule_background_full {
        return true;
    }
    now.saturating_sub(snapshot.full_listed_at) > FULL_VTXO_LIST_RECONCILE_INTERVAL_SECS
}

/// Inclusive lower bound of HD indices included in the recent-script light fetch.
pub fn recent_offchain_derivation_index_floor(next_index: u32, gap_limit: u32) -> u32 {
    next_index.saturating_sub(gap_limit)
}

pub fn derivation_index_is_in_recent_sync_window(
    derivation_index: u32,
    next_index: u32,
    gap_limit: u32,
) -> bool {
    derivation_index >= recent_offchain_derivation_index_floor(next_index, gap_limit)
}

#[cfg(test)]
mod tests {
    use super::{
        FULL_VTXO_LIST_RECONCILE_INTERVAL_SECS, derivation_index_is_in_recent_sync_window,
        full_vtxo_list_reconcile_due, recent_offchain_derivation_index_floor,
        user_facing_operator_sync_uses_light_fetch,
    };
    use crate::persistence::OffchainVtxoSnapshot;
    use std::collections::BTreeMap;

    fn snapshot_with_full_listed_at(full_listed_at: i64) -> OffchainVtxoSnapshot {
        OffchainVtxoSnapshot {
            synced_at: 1_700_000_000,
            dust_sats: 330,
            virtual_tx_outpoints: vec![],
            unilateral_exit_materials_by_host_tx: BTreeMap::new(),
            full_listed_at,
        }
    }

    #[test]
    fn recent_script_window_includes_only_indices_at_or_after_next_minus_gap() {
        assert_eq!(recent_offchain_derivation_index_floor(185, 20), 165);
        assert!(derivation_index_is_in_recent_sync_window(165, 185, 20));
        assert!(derivation_index_is_in_recent_sync_window(184, 185, 20));
        assert!(!derivation_index_is_in_recent_sync_window(164, 185, 20));
        assert_eq!(recent_offchain_derivation_index_floor(10, 20), 0);
        assert!(derivation_index_is_in_recent_sync_window(0, 10, 20));
    }

    #[test]
    fn user_facing_sync_is_light_when_snapshot_exists_even_if_stale_or_schedule_background_full() {
        let snapshot = snapshot_with_full_listed_at(0);
        assert!(user_facing_operator_sync_uses_light_fetch(Some(&snapshot)));
        assert!(full_vtxo_list_reconcile_due(
            Some(&snapshot),
            1_700_000_000,
            true
        ));
    }

    #[test]
    fn user_facing_sync_is_full_when_snapshot_missing() {
        assert!(!user_facing_operator_sync_uses_light_fetch(None));
    }

    #[test]
    fn full_reconcile_due_when_stale_or_schedule_background_full_and_snapshot_present() {
        let now = 1_700_000_000;
        let stale = snapshot_with_full_listed_at(0);
        assert!(full_vtxo_list_reconcile_due(Some(&stale), now, false));
        let fresh = snapshot_with_full_listed_at(now);
        assert!(!full_vtxo_list_reconcile_due(Some(&fresh), now, false));
        assert!(full_vtxo_list_reconcile_due(Some(&fresh), now, true));
        assert!(!full_vtxo_list_reconcile_due(None, now, true));
        let barely_stale =
            snapshot_with_full_listed_at(now - FULL_VTXO_LIST_RECONCILE_INTERVAL_SECS);
        assert!(!full_vtxo_list_reconcile_due(
            Some(&barely_stale),
            now,
            false
        ));
        let over_interval =
            snapshot_with_full_listed_at(now - FULL_VTXO_LIST_RECONCILE_INTERVAL_SECS - 1);
        assert!(full_vtxo_list_reconcile_due(
            Some(&over_interval),
            now,
            false
        ));
    }
}
