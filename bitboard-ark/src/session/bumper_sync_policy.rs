use ark_core::ExplorerUtxo;

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

/// After a wallet-wide bumper scan attempt, keep `Done` only on success so a
/// later bumper-info poll can retry from `Failed`.
pub(crate) fn bumper_sync_phase_after_wallet_scan(success: bool) -> BumperWalletSyncPhase {
    if success {
        BumperWalletSyncPhase::Done
    } else {
        BumperWalletSyncPhase::Failed
    }
}

/// Confirmed unspent sats on the displayed next-unused bumper address (`/utxo`, not `/txs`).
pub(crate) fn tip_address_confirmed_sats(utxos: &[ExplorerUtxo]) -> u64 {
    utxos
        .iter()
        .filter(|utxo| !utxo.is_spent && utxo.confirmation_blocktime.is_some())
        .map(|utxo| utxo.amount.to_sat())
        .sum()
}

/// Cached BDK confirmed sats plus newly confirmed coins on the unused tip address.
pub(crate) fn bumper_confirmed_balance_sats(
    synced_wallet_confirmed_sats: u64,
    tip_address_confirmed_sats: u64,
) -> u64 {
    synced_wallet_confirmed_sats.saturating_add(tip_address_confirmed_sats)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bitcoin::{Amount, OutPoint, Txid};
    use std::str::FromStr;

    fn sample_utxo(
        amount_sats: u64,
        confirmation_blocktime: Option<u64>,
        is_spent: bool,
    ) -> ExplorerUtxo {
        ExplorerUtxo {
            outpoint: OutPoint {
                txid: Txid::from_str(
                    "0000000000000000000000000000000000000000000000000000000000000001",
                )
                .expect("txid"),
                vout: 0,
            },
            amount: Amount::from_sat(amount_sats),
            confirmation_blocktime,
            confirmations: if confirmation_blocktime.is_some() {
                1
            } else {
                0
            },
            is_spent,
        }
    }

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
    fn tip_address_confirmed_sats_sums_confirmed_unspent_only() {
        let utxos = [
            sample_utxo(10_000, Some(1), false),
            sample_utxo(4_000, None, false),
            sample_utxo(7_000, Some(1), true),
        ];
        assert_eq!(tip_address_confirmed_sats(&utxos), 10_000);
    }

    #[test]
    fn bumper_confirmed_balance_sats_adds_wallet_plus_tip() {
        assert_eq!(bumper_confirmed_balance_sats(25_000, 8_000), 33_000);
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
