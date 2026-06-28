use crate::api_types::BalanceDto;
use crate::balance_display::{ArkadeBalanceInputs, build_arkade_balance_dto};
use crate::error::ArkResult;
use crate::offchain_snapshot::offchain_balance_sats_from_snapshot;

use super::ArkSession;

impl ArkSession {
    pub async fn balance(&self) -> ArkResult<BalanceDto> {
        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() {
            self.reconcile_pending_exit_deductions_with_snapshot(&snapshot)?;
        }

        let (pre_confirmed_sats, confirmed_sats, recoverable_sats, pending_recovery_sats) =
            if let Ok(live) = self.client.offchain_balance().await {
                (
                    live.pre_confirmed().to_sat(),
                    live.confirmed().to_sat(),
                    live.recoverable().to_sat(),
                    live.pending_recovery().to_sat(),
                )
            } else if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref()
            {
                let (pre_confirmed, confirmed, recoverable) =
                    offchain_balance_sats_from_snapshot(snapshot)?;
                (pre_confirmed, confirmed, recoverable, 0)
            } else {
                (0, 0, 0, 0)
            };
        let (unilateral_exit_in_progress_sats, collaborative_exit_in_progress_sats) =
            self.exit_balance_components()?;
        let onchain = self.client.onchain_wallet_balance()?;
        let boarding = self.boarding_status().await?;
        Ok(build_arkade_balance_dto(ArkadeBalanceInputs {
            pre_confirmed_sats,
            confirmed_offchain_sats: confirmed_sats,
            recoverable_sats,
            onchain_confirmed_sats: onchain.confirmed.to_sat(),
            boarding_spendable_sats: boarding.spendable_sats,
            boarding_pending_sats: boarding.pending_sats,
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
            pending_recovery_sats,
        }))
    }
}
