use crate::api_types::BalanceDto;
use crate::balance_display::{ArkadeBalanceInputs, build_arkade_balance_dto};
use crate::error::ArkResult;

use super::ArkSession;

impl ArkSession {
    pub async fn balance(&self) -> ArkResult<BalanceDto> {
        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() {
            self.reconcile_pending_exit_deductions_with_snapshot(&snapshot)?;
        }

        let offchain_buckets = self.resolve_offchain_balance_buckets().await?;
        let recoverable_buckets = self.recoverable_vtxo_buckets().await?;
        let (unilateral_exit_in_progress_sats, collaborative_exit_in_progress_sats) =
            self.exit_balance_components()?;
        let onchain = self.client.onchain_wallet_balance()?;
        let boarding = self.boarding_status().await?;
        Ok(build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats: offchain_buckets.pre_confirmed_sats,
            confirmed_offchain_sats: offchain_buckets.confirmed_sats,
            recoverable_settleable_sats: recoverable_buckets.settleable.total_sats,
            recoverable_settleable_vtxo_count: recoverable_buckets.settleable.count,
            recoverable_pending_operator_sweep_sats: recoverable_buckets
                .pending_operator_sweep
                .total_sats,
            recoverable_pending_operator_sweep_vtxo_count: recoverable_buckets
                .pending_operator_sweep
                .count,
            onchain_confirmed_sats: onchain.confirmed.to_sat(),
            boarding_spendable_sats: boarding.spendable_sats,
            boarding_pending_sats: boarding.pending_sats,
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
            pending_recovery_sats: offchain_buckets.pending_recovery_sats,
        }))
    }
}
