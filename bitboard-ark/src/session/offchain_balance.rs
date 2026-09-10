use std::str::FromStr;

use bitcoin::XOnlyPublicKey;

use crate::error::ArkResult;
use crate::offchain_snapshot::{
    OffchainBalanceBuckets, offchain_balance_buckets_from_snapshot,
    pending_recovery_due_to_expired_signer_sats_excluding_unilateral_exit,
};
use crate::persistence::OperatorIdentity;
use crate::session::unilateral_exit::vtxo_exit::unilateral_exit_spend_lock_sats;

use super::ArkSession;
use super::autonomous::balance_vtxo_reads_use_operator_rpc;
use super::mappers::current_unix_timestamp;

impl ArkSession {
    pub(crate) async fn resolve_offchain_balance_buckets(
        &self,
    ) -> ArkResult<OffchainBalanceBuckets> {
        if !balance_vtxo_reads_use_operator_rpc(self.autonomous_mode()) {
            return self.resolve_offchain_balance_buckets_from_snapshot();
        }

        if let Ok(live) = self.client.offchain_balance().await {
            let mut buckets = OffchainBalanceBuckets::from_live(&live);
            let in_progress = self.unilateral_exit_in_progress_outpoints()?;
            if !in_progress.is_empty()
                && let Ok((vtxo_list, script_map)) = self.client.list_vtxos().await
                && let Ok(server_info) = self.client.server_info()
            {
                buckets.pending_recovery_due_to_expired_signer_sats =
                    pending_recovery_due_to_expired_signer_sats_excluding_unilateral_exit(
                        &vtxo_list,
                        &server_info,
                        current_unix_timestamp(),
                        |script| script_map.get(script).map(|vtxo| vtxo.server_pk()),
                        &in_progress,
                    );
            }
            return Ok(buckets);
        }

        self.resolve_offchain_balance_buckets_from_snapshot()
    }

    fn resolve_offchain_balance_buckets_from_snapshot(&self) -> ArkResult<OffchainBalanceBuckets> {
        let wallet_snapshot = self.wallet_db.snapshot();
        let Some(snapshot) = wallet_snapshot.offchain_vtxo_snapshot.as_ref() else {
            return Ok(OffchainBalanceBuckets::zero());
        };
        let server_info = self
            .client
            .server_info()
            .map_err(crate::error::ArkWasmError::from)?;
        let records = self.wallet_db.vtxo_exit_records();
        offchain_balance_buckets_from_snapshot(
            snapshot,
            &server_info,
            current_unix_timestamp(),
            legacy_signer_pk_fallback(&self.persisted_operator_identity()),
            &records,
        )
    }

    pub(crate) fn signer_aware_gross_offchain_spendable_from_snapshot(
        &self,
        snapshot: &crate::persistence::OffchainVtxoSnapshot,
    ) -> ArkResult<u64> {
        let server_info = self
            .client
            .server_info()
            .map_err(crate::error::ArkWasmError::from)?;
        let records = self.wallet_db.vtxo_exit_records();
        let buckets = offchain_balance_buckets_from_snapshot(
            snapshot,
            &server_info,
            current_unix_timestamp(),
            legacy_signer_pk_fallback(&self.persisted_operator_identity()),
            &records,
        )?;
        Ok(buckets.gross_spendable_sats())
    }

    /// Gross offchain spendable minus tagged-or-later amounts still in that gross.
    ///
    /// Does not subtract collaborative-exit-in-progress (a separate overlay). After 6-conf unroll,
    /// ark-core already drops those VTXOs from gross, so spend-lock for them is 0.
    pub(crate) async fn net_cooperative_spendable_sats(&self) -> ArkResult<u64> {
        let buckets = self.resolve_offchain_balance_buckets().await?;
        Ok(buckets
            .gross_spendable_sats()
            .saturating_sub(unilateral_exit_spend_lock_sats(
                &self.wallet_db.vtxo_exit_records(),
                self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref(),
            )))
    }
}

pub(crate) fn legacy_signer_pk_fallback(
    operator_identity: &OperatorIdentity,
) -> Option<XOnlyPublicKey> {
    XOnlyPublicKey::from_str(&operator_identity.signer_pk_hex).ok()
}
