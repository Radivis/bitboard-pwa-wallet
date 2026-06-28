use crate::api_types::BalanceDto;

/// Raw balance buckets passed into [`build_arkade_balance_dto`].
#[derive(Default)]
pub struct ArkadeBalanceInputs {
    pub pre_confirmed_sats: u64,
    pub confirmed_offchain_sats: u64,
    pub recoverable_sats: u64,
    pub onchain_confirmed_sats: u64,
    pub boarding_spendable_sats: u64,
    pub boarding_pending_sats: u64,
    pub unilateral_exit_in_progress_sats: u64,
    pub collaborative_exit_in_progress_sats: u64,
    pub pending_recovery_sats: u64,
}

/// Maps ark-client offchain buckets to dashboard/send balance fields.
///
/// `confirmed_sats` is spendable offchain balance (pre-confirmed Ark payments plus
/// batch-settled VTXOs) plus on-chain confirmed sats. Pre-confirmed VTXOs are spendable
/// in Ark transactions but were previously omitted from `confirmed_sats`, which made
/// incoming payments look permanently pending.
///
/// Boarding UTXOs on the boarding address are reported separately in
/// `boarding_spendable_sats` / `boarding_pending_sats` because they are not VTXOs until
/// settled. The dashboard adds spendable boarding to the headline total in the UI.
///
/// `total_sats` additionally includes recoverable VTXOs (expired, dust, swept),
/// confirmed on-chain bumper sats, and unconfirmed boarding UTXOs (`boarding_pending_sats`).
/// Unconfirmed bumper-wallet UTXOs are omitted from `total_sats` (only `onchain.confirmed` counts).
///
/// `unilateral_exit_in_progress_sats` and `collaborative_exit_in_progress_sats` are informational
/// breakdown fields; they are already subtracted from `confirmed_sats`.
pub fn build_arkade_balance_dto(inputs: ArkadeBalanceInputs) -> BalanceDto {
    let spendable_offchain_sats = inputs
        .pre_confirmed_sats
        .saturating_add(inputs.confirmed_offchain_sats);
    let total_offchain_sats = spendable_offchain_sats
        .saturating_add(inputs.recoverable_sats)
        .saturating_add(inputs.pending_recovery_sats);
    let gross_confirmed_sats =
        spendable_offchain_sats.saturating_add(inputs.onchain_confirmed_sats);
    let exit_in_progress_sats = inputs
        .unilateral_exit_in_progress_sats
        .saturating_add(inputs.collaborative_exit_in_progress_sats);
    let confirmed_sats = gross_confirmed_sats.saturating_sub(exit_in_progress_sats);
    let offchain_spendable_sats =
        spendable_offchain_sats.saturating_sub(exit_in_progress_sats.min(spendable_offchain_sats));
    BalanceDto {
        confirmed_sats,
        offchain_spendable_sats,
        total_sats: total_offchain_sats
            .saturating_add(inputs.onchain_confirmed_sats)
            .saturating_add(inputs.boarding_pending_sats)
            .saturating_sub(exit_in_progress_sats),
        boarding_spendable_sats: inputs.boarding_spendable_sats,
        boarding_pending_sats: inputs.boarding_pending_sats,
        unilateral_exit_in_progress_sats: inputs.unilateral_exit_in_progress_sats,
        collaborative_exit_in_progress_sats: inputs.collaborative_exit_in_progress_sats,
        pending_recovery_sats: inputs.pending_recovery_sats,
    }
}

#[cfg(test)]
mod tests {
    use super::{ArkadeBalanceInputs, build_arkade_balance_dto};

    #[test]
    fn pre_confirmed_incoming_counts_as_spendable_confirmed_balance() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 1_607,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 1_607);
        assert_eq!(balance.total_sats, 1_607);
        assert_eq!(balance.boarding_spendable_sats, 0);
    }

    #[test]
    fn recoverable_sats_increase_total_not_confirmed() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 40_000,
            recoverable_sats: 5_000,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 40_000);
        assert_eq!(balance.total_sats, 45_000);
    }

    #[test]
    fn onchain_confirmed_adds_to_both_fields() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 10_000,
            confirmed_offchain_sats: 5_000,
            recoverable_sats: 1_000,
            onchain_confirmed_sats: 2_000,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 17_000);
        assert_eq!(balance.offchain_spendable_sats, 15_000);
        assert_eq!(balance.total_sats, 18_000);
    }

    #[test]
    fn boarding_spendable_reported_separately_from_offchain_confirmed() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 30_603,
            boarding_spendable_sats: 200_000,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 30_603);
        assert_eq!(balance.boarding_spendable_sats, 200_000);
    }

    #[test]
    fn boarding_pending_increases_total_not_confirmed() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 10_000,
            boarding_pending_sats: 50_000,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 10_000);
        assert_eq!(balance.total_sats, 60_000);
        assert_eq!(balance.boarding_pending_sats, 50_000);
    }

    #[test]
    fn build_arkade_balance_dto_subtracts_exit_in_progress_from_confirmed() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 200_000,
            unilateral_exit_in_progress_sats: 180_603,
            ..Default::default()
        });
        assert_eq!(balance.unilateral_exit_in_progress_sats, 180_603);
        assert_eq!(balance.confirmed_sats, 19_397);
        assert_eq!(balance.total_sats, 19_397);
    }

    #[test]
    fn pending_recovery_increases_total_not_confirmed() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            confirmed_offchain_sats: 0,
            pending_recovery_sats: 50_000,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 0);
        assert_eq!(balance.offchain_spendable_sats, 0);
        assert_eq!(balance.pending_recovery_sats, 50_000);
        assert_eq!(balance.total_sats, 50_000);
    }

    #[test]
    fn deprecated_signer_vtxo_excluded_from_confirmed_sats() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            confirmed_offchain_sats: 0,
            recoverable_sats: 0,
            pending_recovery_sats: 50_000,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 0);
        assert_eq!(balance.total_sats, 50_000);
    }

    #[test]
    fn pending_unilateral_and_collaborative_exit_reduce_net_confirmed() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 300_000,
            unilateral_exit_in_progress_sats: 50_000,
            collaborative_exit_in_progress_sats: 100_000,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 150_000);
        assert_eq!(balance.unilateral_exit_in_progress_sats, 50_000);
        assert_eq!(balance.collaborative_exit_in_progress_sats, 100_000);
    }
}
