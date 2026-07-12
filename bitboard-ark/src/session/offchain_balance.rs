use std::str::FromStr;

use bitcoin::XOnlyPublicKey;

use crate::error::ArkResult;
use crate::offchain_snapshot::{
    OffchainBalanceBuckets, offchain_balance_buckets_from_snapshot,
    pending_recovery_due_to_expired_signer_sats_excluding_unilateral_exit,
};
use crate::persistence::OperatorIdentity;

use super::ArkSession;
use super::mappers::current_unix_timestamp;

impl ArkSession {
    pub(crate) async fn resolve_offchain_balance_buckets(
        &self,
    ) -> ArkResult<OffchainBalanceBuckets> {
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

        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref()
            && let Ok(server_info) = self.client.server_info()
        {
            let pending = self.wallet_db.pending_exit_deductions();
            let watches = self.wallet_db.unilateral_exit_watches();
            return offchain_balance_buckets_from_snapshot(
                snapshot,
                &server_info,
                current_unix_timestamp(),
                legacy_signer_pk_fallback(&self.persisted_operator_identity()),
                &pending,
                &watches,
            );
        }

        Ok(OffchainBalanceBuckets::zero())
    }

    pub(crate) fn signer_aware_gross_offchain_spendable_from_snapshot(
        &self,
        snapshot: &crate::persistence::OffchainVtxoSnapshot,
    ) -> ArkResult<u64> {
        let server_info = self
            .client
            .server_info()
            .map_err(crate::error::ArkWasmError::from)?;
        let pending = self.wallet_db.pending_exit_deductions();
        let watches = self.wallet_db.unilateral_exit_watches();
        let buckets = offchain_balance_buckets_from_snapshot(
            snapshot,
            &server_info,
            current_unix_timestamp(),
            legacy_signer_pk_fallback(&self.persisted_operator_identity()),
            &pending,
            &watches,
        )?;
        Ok(buckets.gross_spendable_sats())
    }
}

pub(crate) fn legacy_signer_pk_fallback(
    operator_identity: &OperatorIdentity,
) -> Option<XOnlyPublicKey> {
    XOnlyPublicKey::from_str(&operator_identity.signer_pk_hex).ok()
}
