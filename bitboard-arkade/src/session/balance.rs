use crate::api_types::{BalanceDto, LiveDashboardDto, PendingBatchIntentDto};
use crate::balance_display::{ArkadeBalanceInputs, build_arkade_balance_dto};
use crate::error::ArkResult;
use crate::offchain_snapshot::OffchainBalanceBuckets;
use crate::session::vtxo::RecoverableVtxoBuckets;

use super::ArkadeSession;

struct OffchainBalanceParts {
    offchain_buckets: OffchainBalanceBuckets,
    recoverable_buckets: RecoverableVtxoBuckets,
    onchain_confirmed_sats: u64,
    unilateral_exit_in_progress_sats: u64,
    collaborative_exit_in_progress_sats: u64,
    unilateral_exit_spend_lock_sats: u64,
}

fn balance_dto_from_parts(
    parts: &OffchainBalanceParts,
    boarding_spendable_sats: u64,
    boarding_pending_sats: u64,
    pending_batch_intents: Vec<PendingBatchIntentDto>,
) -> BalanceDto {
    build_arkade_balance_dto(ArkadeBalanceInputs {
        pre_confirmed_sats: parts.offchain_buckets.pre_confirmed_sats,
        confirmed_offchain_sats: parts.offchain_buckets.confirmed_sats,
        recoverable_settleable_sats: parts.recoverable_buckets.settleable.total_sats,
        recoverable_settleable_vtxo_count: parts.recoverable_buckets.settleable.count,
        recoverable_pending_operator_sweep_sats: parts
            .recoverable_buckets
            .pending_operator_sweep
            .total_sats,
        recoverable_pending_operator_sweep_vtxo_count: parts
            .recoverable_buckets
            .pending_operator_sweep
            .count,
        onchain_confirmed_sats: parts.onchain_confirmed_sats,
        boarding_spendable_sats,
        boarding_pending_sats,
        unilateral_exit_in_progress_sats: parts.unilateral_exit_in_progress_sats,
        collaborative_exit_in_progress_sats: parts.collaborative_exit_in_progress_sats,
        unilateral_exit_spend_lock_sats: parts.unilateral_exit_spend_lock_sats,
        pending_recovery_due_to_expired_signer_sats: parts
            .offchain_buckets
            .pending_recovery_due_to_expired_signer_sats,
        pending_batch_intents,
    })
}

impl ArkadeSession {
    pub async fn balance(&self) -> ArkResult<BalanceDto> {
        let parts = self.live_offchain_balance_parts().await?;
        let boarding = self.boarding_status().await?;
        Ok(balance_dto_from_parts(
            &parts,
            boarding.spendable_sats,
            boarding.pending_sats,
            boarding.pending_batch_intents,
        ))
    }

    /// Balance and history from one boarding listing. Used by the post-load refresh.
    pub async fn live_dashboard(&self) -> ArkResult<LiveDashboardDto> {
        let parts = self.live_offchain_balance_parts().await?;
        self.persist_watched_boarding_outputs()?;
        let _finalized_commitment_txid = self.reconcile_pending_batch_intents().await?;
        let scan = self.scan_persisted_boarding_outputs().await?;
        let balance = balance_dto_from_parts(
            &parts,
            scan.spendable_sats,
            scan.pending_sats,
            self.pending_batch_intents_dto(),
        );
        let payments = self.payments_from_boarding_scan(&scan).await?;
        Ok(LiveDashboardDto { balance, payments })
    }

    async fn live_offchain_balance_parts(&self) -> ArkResult<OffchainBalanceParts> {
        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() {
            self.reconcile_pending_exit_deductions_with_snapshot(&snapshot)?;
        }

        let offchain_buckets = self.resolve_offchain_balance_buckets().await?;
        let recoverable_buckets = self.recoverable_vtxo_buckets().await?;
        let (
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
            unilateral_exit_spend_lock_sats,
        ) = self.exit_balance_components()?;
        let onchain = self.client.onchain_wallet_balance()?;
        Ok(OffchainBalanceParts {
            offchain_buckets,
            recoverable_buckets,
            onchain_confirmed_sats: onchain.confirmed.to_sat(),
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
            unilateral_exit_spend_lock_sats,
        })
    }
}
