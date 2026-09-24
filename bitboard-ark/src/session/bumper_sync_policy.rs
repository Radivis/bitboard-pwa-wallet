use std::cell::Cell;

/// Whether this session has already started or finished a bumper BDK wallet scan.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BumperWalletSyncPhase {
    NotStarted,
    Running,
    Failed,
    Done,
}

/// LIFE-ARK-BUMP-01: start a wallet-wide Esplora scan when none has succeeded yet.
/// The scan may be incremental when the bumper already completed a full scan.
/// `Failed` is retryable; `Running` and `Done` are not.
pub(crate) fn bumper_info_should_start_wallet_scan(phase: BumperWalletSyncPhase) -> bool {
    matches!(
        phase,
        BumperWalletSyncPhase::NotStarted | BumperWalletSyncPhase::Failed
    )
}

/// LIFE-ARK-BUMP-01: complete must Esplora-sync the bumper wallet before spend,
/// even when `onchain_bumper_info` already scanned this session.
pub(crate) fn completion_spend_should_sync_bumper_wallet(_phase: BumperWalletSyncPhase) -> bool {
    true
}

/// LIFE-ARK-BUMP-01: fee estimate uses the same once-per-session scan as bumper-info
/// so destination / fee-rate refetches do not restart an HD walk.
pub(crate) fn completion_estimate_should_sync_bumper_wallet(phase: BumperWalletSyncPhase) -> bool {
    bumper_info_should_start_wallet_scan(phase)
}

/// How an unroll-step broadcast refreshes bumper coins.
///
/// The exit page already runs one wallet-wide scan. Proceed must not start a second
/// walk of every revealed script (`start_sync_with_revealed_spks`), which 429s on
/// Mutinynet after a long bumper history.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ExitBroadcastBumperSync {
    WalletWide,
    SpendableScripts,
}

pub(crate) fn exit_broadcast_bumper_sync(phase: BumperWalletSyncPhase) -> ExitBroadcastBumperSync {
    if bumper_info_should_start_wallet_scan(phase) {
        ExitBroadcastBumperSync::WalletWide
    } else {
        ExitBroadcastBumperSync::SpendableScripts
    }
}

/// Persist the bumper sidecar when this call starts a wallet-wide scan, or when
/// it waited out another task's scan that reached `Done`.
pub(crate) fn bumper_info_needs_wallet_sync_persist(
    phase_before_wait: BumperWalletSyncPhase,
    phase_after_settle: BumperWalletSyncPhase,
) -> bool {
    bumper_info_should_start_wallet_scan(phase_before_wait)
        || (phase_before_wait == BumperWalletSyncPhase::Running
            && phase_after_settle == BumperWalletSyncPhase::Done)
}

/// Sets `Running` for a wallet-wide bumper scan. If that future is dropped
/// before it records `Done` or `Failed`, the phase becomes `Failed` so waiters
/// are not stuck on `Running`.
pub(crate) struct BumperWalletScanGuard<'a> {
    phase: &'a Cell<BumperWalletSyncPhase>,
}

impl<'a> BumperWalletScanGuard<'a> {
    pub(crate) fn begin(phase: &'a Cell<BumperWalletSyncPhase>) -> Self {
        phase.set(BumperWalletSyncPhase::Running);
        Self { phase }
    }
}

impl Drop for BumperWalletScanGuard<'_> {
    fn drop(&mut self) {
        if self.phase.get() == BumperWalletSyncPhase::Running {
            self.phase.set(BumperWalletSyncPhase::Failed);
        }
    }
}

/// After a wallet-wide bumper scan attempt, keep `Done` only on success so a
/// later bumper-info poll can retry from `Failed`.
pub(crate) fn bumper_sync_phase_after_wallet_scan(success: bool) -> BumperWalletSyncPhase {
    if success {
        BumperWalletSyncPhase::Done
    } else {
        BumperWalletSyncPhase::Failed
    }
}

/// After unused-SPK Esplora is applied, bumper-info trusts BDK confirmed only.
pub(crate) fn bumper_info_balance_sats(wallet_confirmed_sats: u64) -> u64 {
    wallet_confirmed_sats
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bumper_info_should_start_wallet_scan_is_true_when_not_started_or_failed() {
        assert!(bumper_info_should_start_wallet_scan(
            BumperWalletSyncPhase::NotStarted
        ));
        assert!(bumper_info_should_start_wallet_scan(
            BumperWalletSyncPhase::Failed
        ));
        assert!(!bumper_info_should_start_wallet_scan(
            BumperWalletSyncPhase::Running
        ));
        assert!(!bumper_info_should_start_wallet_scan(
            BumperWalletSyncPhase::Done
        ));
    }

    #[test]
    fn bumper_info_balance_sats_is_wallet_confirmed_only() {
        assert_eq!(bumper_info_balance_sats(25_000), 25_000);
    }

    #[test]
    fn bumper_sync_phase_after_wallet_scan_is_done_on_success() {
        assert_eq!(
            bumper_sync_phase_after_wallet_scan(true),
            BumperWalletSyncPhase::Done
        );
    }

    #[test]
    fn bumper_sync_phase_after_wallet_scan_is_failed_on_failure() {
        assert_eq!(
            bumper_sync_phase_after_wallet_scan(false),
            BumperWalletSyncPhase::Failed
        );
    }

    #[test]
    fn bumper_info_should_start_wallet_scan_after_failed_scan() {
        let phase = bumper_sync_phase_after_wallet_scan(false);
        assert!(bumper_info_should_start_wallet_scan(phase));
    }

    #[test]
    fn bumper_info_should_start_wallet_scan_retries_after_failed_then_stops_after_success() {
        let after_failed_scan = bumper_sync_phase_after_wallet_scan(false);
        assert!(bumper_info_should_start_wallet_scan(after_failed_scan));
        let after_retry_success = bumper_sync_phase_after_wallet_scan(true);
        assert!(!bumper_info_should_start_wallet_scan(after_retry_success));
    }

    #[test]
    fn completion_spend_should_sync_bumper_wallet_for_every_phase() {
        for phase in [
            BumperWalletSyncPhase::NotStarted,
            BumperWalletSyncPhase::Running,
            BumperWalletSyncPhase::Failed,
            BumperWalletSyncPhase::Done,
        ] {
            assert!(
                completion_spend_should_sync_bumper_wallet(phase),
                "complete must Esplora-sync bumper before spend even if bumper_info already scanned ({phase:?})"
            );
        }
    }

    #[test]
    fn dropped_bumper_scan_marks_running_failed_and_finished_scan_keeps_done() {
        let phase = Cell::new(BumperWalletSyncPhase::NotStarted);
        let guard = BumperWalletScanGuard::begin(&phase);
        assert_eq!(phase.get(), BumperWalletSyncPhase::Running);
        drop(guard);
        assert_eq!(phase.get(), BumperWalletSyncPhase::Failed);

        let phase = Cell::new(BumperWalletSyncPhase::NotStarted);
        let guard = BumperWalletScanGuard::begin(&phase);
        phase.set(BumperWalletSyncPhase::Done);
        drop(guard);
        assert_eq!(phase.get(), BumperWalletSyncPhase::Done);
    }

    #[test]
    fn bumper_info_persist_includes_a_scan_this_call_waited_out() {
        assert!(bumper_info_needs_wallet_sync_persist(
            BumperWalletSyncPhase::NotStarted,
            BumperWalletSyncPhase::Done,
        ));
        assert!(bumper_info_needs_wallet_sync_persist(
            BumperWalletSyncPhase::Running,
            BumperWalletSyncPhase::Done,
        ));
        assert!(!bumper_info_needs_wallet_sync_persist(
            BumperWalletSyncPhase::Running,
            BumperWalletSyncPhase::Failed,
        ));
        assert!(!bumper_info_needs_wallet_sync_persist(
            BumperWalletSyncPhase::Done,
            BumperWalletSyncPhase::Done,
        ));
    }

    #[test]
    fn exit_broadcast_bumper_sync_is_wallet_wide_only_before_a_successful_scan() {
        assert_eq!(
            exit_broadcast_bumper_sync(BumperWalletSyncPhase::NotStarted),
            ExitBroadcastBumperSync::WalletWide
        );
        assert_eq!(
            exit_broadcast_bumper_sync(BumperWalletSyncPhase::Failed),
            ExitBroadcastBumperSync::WalletWide
        );
        assert_eq!(
            exit_broadcast_bumper_sync(BumperWalletSyncPhase::Running),
            ExitBroadcastBumperSync::SpendableScripts
        );
        assert_eq!(
            exit_broadcast_bumper_sync(BumperWalletSyncPhase::Done),
            ExitBroadcastBumperSync::SpendableScripts
        );
    }

    #[test]
    fn completion_estimate_should_sync_bumper_wallet_when_scan_not_succeeded() {
        assert!(completion_estimate_should_sync_bumper_wallet(
            BumperWalletSyncPhase::NotStarted
        ));
        assert!(completion_estimate_should_sync_bumper_wallet(
            BumperWalletSyncPhase::Failed
        ));
        assert!(!completion_estimate_should_sync_bumper_wallet(
            BumperWalletSyncPhase::Running
        ));
        assert!(!completion_estimate_should_sync_bumper_wallet(
            BumperWalletSyncPhase::Done
        ));
    }
}
