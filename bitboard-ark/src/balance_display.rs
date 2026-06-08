use crate::api_types::BalanceDto;

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
/// `total_sats` additionally includes recoverable VTXOs (expired, dust, swept).
pub fn build_arkade_balance_dto(
    pre_confirmed_sats: u64,
    confirmed_offchain_sats: u64,
    recoverable_sats: u64,
    onchain_confirmed_sats: u64,
    boarding_spendable_sats: u64,
    boarding_pending_sats: u64,
) -> BalanceDto {
    let spendable_offchain_sats = pre_confirmed_sats.saturating_add(confirmed_offchain_sats);
    let total_offchain_sats = spendable_offchain_sats.saturating_add(recoverable_sats);
    let confirmed_sats = spendable_offchain_sats.saturating_add(onchain_confirmed_sats);
    BalanceDto {
        confirmed_sats,
        total_sats: total_offchain_sats
            .saturating_add(onchain_confirmed_sats)
            .saturating_add(boarding_pending_sats),
        boarding_spendable_sats,
        boarding_pending_sats,
    }
}

#[cfg(test)]
mod tests {
    use super::build_arkade_balance_dto;

    #[test]
    fn pre_confirmed_incoming_counts_as_spendable_confirmed_balance() {
        let balance = build_arkade_balance_dto(1_607, 0, 0, 0, 0, 0);
        assert_eq!(balance.confirmed_sats, 1_607);
        assert_eq!(balance.total_sats, 1_607);
        assert_eq!(balance.boarding_spendable_sats, 0);
    }

    #[test]
    fn recoverable_sats_increase_total_not_confirmed() {
        let balance = build_arkade_balance_dto(40_000, 0, 5_000, 0, 0, 0);
        assert_eq!(balance.confirmed_sats, 40_000);
        assert_eq!(balance.total_sats, 45_000);
    }

    #[test]
    fn onchain_confirmed_adds_to_both_fields() {
        let balance = build_arkade_balance_dto(10_000, 5_000, 1_000, 2_000, 0, 0);
        assert_eq!(balance.confirmed_sats, 17_000);
        assert_eq!(balance.total_sats, 18_000);
    }

    #[test]
    fn boarding_spendable_reported_separately_from_offchain_confirmed() {
        let balance = build_arkade_balance_dto(30_603, 0, 0, 0, 200_000, 0);
        assert_eq!(balance.confirmed_sats, 30_603);
        assert_eq!(balance.boarding_spendable_sats, 200_000);
    }

    #[test]
    fn boarding_pending_increases_total_not_confirmed() {
        let balance = build_arkade_balance_dto(10_000, 0, 0, 0, 0, 50_000);
        assert_eq!(balance.confirmed_sats, 10_000);
        assert_eq!(balance.total_sats, 60_000);
        assert_eq!(balance.boarding_pending_sats, 50_000);
    }
}
