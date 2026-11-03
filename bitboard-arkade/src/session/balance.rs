use super::ArkadeSession;
use super::vtxo::RecoverableVtxoBuckets;
use crate::api_types::{BalanceDto, PendingBatchIntentDto, PersistedDashboardDto};
use crate::balance_display::{ArkadeBalanceInputs, build_arkade_balance_dto};
use crate::error::ArkResult;
use crate::offchain_snapshot::OffchainBalanceBuckets;

impl ArkadeSession {
    /// Synchronous dashboard from the persisted envelope.
    ///
    /// Must not await the operator or Esplora. Session start publishes this, then
    /// the live balance and history refresh runs after `loaded`.
    pub(crate) fn persisted_dashboard(&self) -> ArkResult<PersistedDashboardDto> {
        Ok(PersistedDashboardDto {
            balance: self.balance_from_persisted_envelope()?,
            payments: self.transaction_history_from_persisted_envelope()?,
            receive_address: self.peek_offchain_address()?,
        })
    }

    fn balance_from_persisted_envelope(&self) -> ArkResult<BalanceDto> {
        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() {
            self.reconcile_pending_exit_deductions_with_snapshot(&snapshot)?;
        }

        let offchain_buckets = self.resolve_offchain_balance_buckets_from_snapshot()?;
        let recoverable_buckets = self.recoverable_vtxo_buckets_from_persisted_snapshot()?;
        self.balance_dto_from_local_buckets(
            offchain_buckets,
            recoverable_buckets,
            0,
            0,
            self.pending_batch_intents_dto(),
        )
    }

    pub async fn balance(&self) -> ArkResult<BalanceDto> {
        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() {
            self.reconcile_pending_exit_deductions_with_snapshot(&snapshot)?;
        }

        let offchain_buckets = self.resolve_offchain_balance_buckets().await?;
        let recoverable_buckets = self.recoverable_vtxo_buckets().await?;
        let boarding = self.boarding_status().await?;
        self.balance_dto_from_local_buckets(
            offchain_buckets,
            recoverable_buckets,
            boarding.spendable_sats,
            boarding.pending_sats,
            boarding.pending_batch_intents,
        )
    }

    fn balance_dto_from_local_buckets(
        &self,
        offchain_buckets: OffchainBalanceBuckets,
        recoverable_buckets: RecoverableVtxoBuckets,
        boarding_spendable_sats: u64,
        boarding_pending_sats: u64,
        pending_batch_intents: Vec<PendingBatchIntentDto>,
    ) -> ArkResult<BalanceDto> {
        let (
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
            unilateral_exit_spend_lock_sats,
        ) = self.exit_balance_components()?;
        let onchain = self.client.onchain_wallet_balance()?;
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
            boarding_spendable_sats,
            boarding_pending_sats,
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
            unilateral_exit_spend_lock_sats,
            pending_recovery_due_to_expired_signer_sats: offchain_buckets
                .pending_recovery_due_to_expired_signer_sats,
            pending_batch_intents,
        }))
    }
}
