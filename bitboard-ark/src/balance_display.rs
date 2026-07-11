use crate::api_types::BalanceDto;

/// Raw balance buckets passed into [`build_arkade_balance_dto`].
#[derive(Default)]
pub struct ArkadeBalanceInputs {
    pub pre_confirmed_sats: u64,
    pub confirmed_offchain_sats: u64,
    pub recoverable_settleable_sats: u64,
    pub recoverable_settleable_vtxo_count: u32,
    pub recoverable_pending_operator_sweep_sats: u64,
    pub recoverable_pending_operator_sweep_vtxo_count: u32,
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
/// `total_sats` additionally includes settleable recoverable VTXOs, VTXOs awaiting operator
/// sweep, confirmed on-chain bumper sats, and unconfirmed boarding UTXOs (`boarding_pending_sats`).
/// Unconfirmed bumper-wallet UTXOs are omitted from `total_sats` (only `onchain.confirmed` counts).
///
/// `unilateral_exit_in_progress_sats` is informational only: after unroll, unrolled VTXOs live in
/// the **exiting** sub-bucket (under `unspendable`) and are already excluded from spendable offchain
/// totals. Do not subtract this
/// field from net spendable — see `docs/arkade-bitboard-wallet-model.md` (unilateral exit timing).
///
/// `collaborative_exit_in_progress_sats` is subtracted from net fields while the operator snapshot
/// still lists those VTXOs as cooperatively spendable (pending exit deduction records).
pub fn build_arkade_balance_dto(inputs: ArkadeBalanceInputs) -> BalanceDto {
    let spendable_offchain_sats = inputs
        .pre_confirmed_sats
        .saturating_add(inputs.confirmed_offchain_sats);
    let total_offchain_sats = spendable_offchain_sats
        .saturating_add(inputs.recoverable_settleable_sats)
        .saturating_add(inputs.recoverable_pending_operator_sweep_sats)
        .saturating_add(inputs.pending_recovery_sats);
    let gross_confirmed_sats =
        spendable_offchain_sats.saturating_add(inputs.onchain_confirmed_sats);
    // Only collaborative exit is subtracted here; unilateral amounts are already out of gross
    // spendable via the exiting sub-bucket (see wallet model doc).
    let collaborative_exit_in_progress_sats = inputs.collaborative_exit_in_progress_sats;
    let confirmed_sats = gross_confirmed_sats.saturating_sub(collaborative_exit_in_progress_sats);
    let offchain_spendable_sats = spendable_offchain_sats
        .saturating_sub(collaborative_exit_in_progress_sats.min(spendable_offchain_sats));
    BalanceDto {
        confirmed_sats,
        offchain_spendable_sats,
        onchain_bumper_sats: inputs.onchain_confirmed_sats,
        total_sats: total_offchain_sats
            .saturating_add(inputs.onchain_confirmed_sats)
            .saturating_add(inputs.boarding_pending_sats)
            .saturating_sub(collaborative_exit_in_progress_sats),
        boarding_spendable_sats: inputs.boarding_spendable_sats,
        boarding_pending_sats: inputs.boarding_pending_sats,
        unilateral_exit_in_progress_sats: inputs.unilateral_exit_in_progress_sats,
        collaborative_exit_in_progress_sats: inputs.collaborative_exit_in_progress_sats,
        pending_recovery_sats: inputs.pending_recovery_sats,
        recoverable_settleable_sats: inputs.recoverable_settleable_sats,
        recoverable_settleable_vtxo_count: inputs.recoverable_settleable_vtxo_count,
        recoverable_pending_operator_sweep_sats: inputs.recoverable_pending_operator_sweep_sats,
        recoverable_pending_operator_sweep_vtxo_count: inputs
            .recoverable_pending_operator_sweep_vtxo_count,
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
    fn recoverable_settleable_sats_increase_total_not_confirmed() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 40_000,
            recoverable_settleable_sats: 5_000,
            recoverable_settleable_vtxo_count: 2,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 40_000);
        assert_eq!(balance.total_sats, 45_000);
        assert_eq!(balance.recoverable_settleable_sats, 5_000);
        assert_eq!(balance.recoverable_settleable_vtxo_count, 2);
    }

    #[test]
    fn recoverable_pending_operator_sweep_increases_total_not_confirmed() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 40_000,
            recoverable_pending_operator_sweep_sats: 12_000,
            recoverable_pending_operator_sweep_vtxo_count: 1,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 40_000);
        assert_eq!(balance.total_sats, 52_000);
        assert_eq!(balance.recoverable_pending_operator_sweep_sats, 12_000);
        assert_eq!(balance.recoverable_settleable_vtxo_count, 0);
    }

    #[test]
    fn onchain_confirmed_adds_to_both_fields() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 10_000,
            confirmed_offchain_sats: 5_000,
            recoverable_settleable_sats: 1_000,
            onchain_confirmed_sats: 2_000,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 17_000);
        assert_eq!(balance.offchain_spendable_sats, 15_000);
        assert_eq!(balance.onchain_bumper_sats, 2_000);
        assert_eq!(balance.total_sats, 18_000);
    }

    #[test]
    fn onchain_bumper_exposed_separately_from_offchain_headline_fields() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            confirmed_offchain_sats: 0,
            onchain_confirmed_sats: 50_000,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 50_000);
        assert_eq!(balance.offchain_spendable_sats, 0);
        assert_eq!(balance.onchain_bumper_sats, 50_000);
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
    // Post-unroll: unilateral_exit_in_progress is informational; gross spendable already excludes
    // the unrolled VTXO via the exiting sub-bucket — must not subtract again.
    fn unilateral_exit_in_progress_does_not_reduce_spendable_totals() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 200_000,
            unilateral_exit_in_progress_sats: 180_603,
            ..Default::default()
        });
        assert_eq!(balance.unilateral_exit_in_progress_sats, 180_603);
        assert_eq!(balance.confirmed_sats, 200_000);
        assert_eq!(balance.offchain_spendable_sats, 200_000);
        assert_eq!(balance.total_sats, 200_000);
    }

    #[test]
    // Collaborative exit VTXOs stay in gross spendable until operator sync; pending amount is
    // subtracted from net fields until the snapshot catches up.
    fn collaborative_exit_in_progress_reduces_net_confirmed() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 200_000,
            collaborative_exit_in_progress_sats: 180_603,
            ..Default::default()
        });
        assert_eq!(balance.collaborative_exit_in_progress_sats, 180_603);
        assert_eq!(balance.confirmed_sats, 19_397);
        assert_eq!(balance.offchain_spendable_sats, 19_397);
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
            recoverable_settleable_sats: 0,
            pending_recovery_sats: 50_000,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 0);
        assert_eq!(balance.total_sats, 50_000);
    }

    #[test]
    // Only collaborative subtracts from net spendable; unilateral is informational only.
    fn only_collaborative_exit_in_progress_reduces_net_confirmed() {
        let balance = build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: 300_000,
            unilateral_exit_in_progress_sats: 50_000,
            collaborative_exit_in_progress_sats: 100_000,
            ..Default::default()
        });
        assert_eq!(balance.confirmed_sats, 200_000);
        assert_eq!(balance.offchain_spendable_sats, 200_000);
        assert_eq!(balance.unilateral_exit_in_progress_sats, 50_000);
        assert_eq!(balance.collaborative_exit_in_progress_sats, 100_000);
    }
}
