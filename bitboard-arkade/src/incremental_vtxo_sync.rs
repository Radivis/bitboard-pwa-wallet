use crate::persistence::OffchainVtxoSnapshot;

/// How often a background full unfiltered VTXO list may run after a snapshot exists.
///
/// Ten minutes, not the 15-minute idle auto-lock. A scan that becomes due at the lock
/// boundary can still be in flight when the session is torn down, and that discards the work.
///
/// Balance and recoverable amounts read the offchain snapshot between those reconciles
/// (ARK-SYNC-07). They can lag a full operator history by this interval plus the dashboard
/// poll interval. HD indices outside the recent light-sync window stay unchanged until the
/// background full list commits.
pub const FULL_VTXO_LIST_RECONCILE_INTERVAL_SECS: i64 = 10 * 60;

/// User-facing operator sync uses the light fetch whenever a snapshot already exists (ARK-SYNC-04).
pub fn user_facing_operator_sync_uses_light_fetch(snapshot: Option<&OffchainVtxoSnapshot>) -> bool {
    snapshot.is_some()
}

/// User-facing sync calls `discover_keys` only for bootstrap, when no snapshot exists (ARK-SYNC-08).
///
/// Signer migration does not use this predicate. It still calls `sync_offchain_keys` itself.
pub fn user_facing_operator_sync_runs_key_discovery(
    snapshot: Option<&OffchainVtxoSnapshot>,
) -> bool {
    !user_facing_operator_sync_uses_light_fetch(snapshot)
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

/// Snapshot coin selection is current only while a full reconcile is not due and the latest
/// offchain key discovery succeeded (ARK-SYNC-07).
///
/// A due reconcile means the snapshot can still list VTXOs the operator has already spent
/// outside the recent light-sync window. A failed key discovery means new receive scripts
/// may be missing from that snapshot. Send then asks `list_spendable_vtxos` instead.
pub fn send_coin_selection_may_use_offchain_snapshot(
    snapshot: Option<&OffchainVtxoSnapshot>,
    now: i64,
    offchain_key_discovery_failed: bool,
) -> bool {
    if offchain_key_discovery_failed {
        return false;
    }
    !full_vtxo_list_reconcile_due(snapshot, now, false)
}

/// Revealed receive indices included in the light VTXO address fetch.
///
/// Wider than the key-discovery gap of 20, so a receive on an older revealed address
/// is included without a full list. `discover_keys` still stops on that gap.
pub const LIGHT_SYNC_RECENT_RECEIVE_ADDRESS_COUNT: u32 = 60;

/// Inclusive lower bound of HD indices included in the recent-script light fetch.
pub fn recent_offchain_derivation_index_floor(next_index: u32, window_size: u32) -> u32 {
    next_index.saturating_sub(window_size)
}

pub fn derivation_index_is_in_recent_sync_window(
    derivation_index: u32,
    next_index: u32,
    window_size: u32,
) -> bool {
    derivation_index >= recent_offchain_derivation_index_floor(next_index, window_size)
}

#[cfg(test)]
mod tests {
    use super::{
        FULL_VTXO_LIST_RECONCILE_INTERVAL_SECS, LIGHT_SYNC_RECENT_RECEIVE_ADDRESS_COUNT,
        derivation_index_is_in_recent_sync_window, full_vtxo_list_reconcile_due,
        recent_offchain_derivation_index_floor, send_coin_selection_may_use_offchain_snapshot,
        user_facing_operator_sync_runs_key_discovery, user_facing_operator_sync_uses_light_fetch,
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
    fn recent_script_window_includes_the_latest_60_revealed_indices() {
        let window = LIGHT_SYNC_RECENT_RECEIVE_ADDRESS_COUNT;
        assert_eq!(window, 60);
        assert_eq!(recent_offchain_derivation_index_floor(185, window), 125);
        assert!(derivation_index_is_in_recent_sync_window(125, 185, window));
        assert!(derivation_index_is_in_recent_sync_window(184, 185, window));
        assert!(!derivation_index_is_in_recent_sync_window(124, 185, window));
        assert_eq!(recent_offchain_derivation_index_floor(40, window), 0);
        assert!(derivation_index_is_in_recent_sync_window(0, 40, window));
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
    fn user_facing_sync_skips_key_discovery_when_snapshot_exists() {
        let snapshot = snapshot_with_full_listed_at(1);
        assert!(!user_facing_operator_sync_runs_key_discovery(Some(
            &snapshot
        )));
        assert!(user_facing_operator_sync_runs_key_discovery(None));
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

    #[test]
    fn send_skips_snapshot_coin_selection_when_full_reconcile_is_due() {
        let now = 1_700_000_000;
        let fresh = snapshot_with_full_listed_at(now);
        assert!(send_coin_selection_may_use_offchain_snapshot(
            Some(&fresh),
            now,
            false
        ));
        let stale = snapshot_with_full_listed_at(now - FULL_VTXO_LIST_RECONCILE_INTERVAL_SECS - 1);
        assert!(!send_coin_selection_may_use_offchain_snapshot(
            Some(&stale),
            now,
            false
        ));
        assert!(send_coin_selection_may_use_offchain_snapshot(
            None, now, false
        ));
    }

    #[test]
    fn send_skips_snapshot_coin_selection_when_key_discovery_failed() {
        let now = 1_700_000_000;
        let fresh = snapshot_with_full_listed_at(now);
        assert!(!send_coin_selection_may_use_offchain_snapshot(
            Some(&fresh),
            now,
            true
        ));
    }
}
