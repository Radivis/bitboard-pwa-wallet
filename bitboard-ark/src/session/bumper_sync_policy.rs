use ark_core::ExplorerUtxo;

/// Whether this session has already started or finished a bumper BDK wallet scan.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BumperWalletSyncPhase {
    NotStarted,
    Running,
    Done,
}

/// LIFE-ARK-BUMP-01: only the first bumper-info call may start a wallet-wide Esplora scan.
pub(crate) fn bumper_info_should_full_sync_wallet(phase: BumperWalletSyncPhase) -> bool {
    phase == BumperWalletSyncPhase::NotStarted
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

/// LIFE-ARK-BUMP-03: Arkade may persist SegWit-0 only when it is not the crypto slot.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn arkade_should_persist_segwit0_sidecar(
    loaded_address_type: Option<&str>,
    loaded_account_id: Option<i32>,
) -> bool {
    !(loaded_address_type == Some("segwit") && loaded_account_id == Some(0))
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
    fn bumper_info_should_full_sync_wallet_is_true_only_when_not_started() {
        assert!(bumper_info_should_full_sync_wallet(
            BumperWalletSyncPhase::NotStarted
        ));
        assert!(!bumper_info_should_full_sync_wallet(
            BumperWalletSyncPhase::Running
        ));
        assert!(!bumper_info_should_full_sync_wallet(
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
    fn arkade_should_persist_segwit0_sidecar_is_false_only_for_loaded_segwit0() {
        assert!(!arkade_should_persist_segwit0_sidecar(
            Some("segwit"),
            Some(0)
        ));
        assert!(arkade_should_persist_segwit0_sidecar(
            Some("taproot"),
            Some(0)
        ));
        assert!(arkade_should_persist_segwit0_sidecar(
            Some("segwit"),
            Some(1)
        ));
        assert!(arkade_should_persist_segwit0_sidecar(None, None));
    }
}
