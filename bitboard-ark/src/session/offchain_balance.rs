use std::str::FromStr;

use bitcoin::XOnlyPublicKey;

use crate::error::ArkResult;
use crate::offchain_snapshot::{OffchainBalanceBuckets, offchain_balance_buckets_from_snapshot};
use crate::persistence::OperatorIdentity;

use super::ArkSession;
use super::mappers::current_unix_timestamp;

impl ArkSession {
    pub(crate) async fn resolve_offchain_balance_buckets(
        &self,
    ) -> ArkResult<OffchainBalanceBuckets> {
        if let Ok(live) = self.client.offchain_balance().await {
            return Ok(OffchainBalanceBuckets::from_live(&live));
        }

        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref() {
            if let Ok(server_info) = self.client.server_info() {
                return offchain_balance_buckets_from_snapshot(
                    snapshot,
                    &server_info,
                    current_unix_timestamp(),
                    legacy_signer_pk_fallback(&self.operator_identity),
                );
            }
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
        let buckets = offchain_balance_buckets_from_snapshot(
            snapshot,
            &server_info,
            current_unix_timestamp(),
            legacy_signer_pk_fallback(&self.operator_identity),
        )?;
        Ok(buckets.gross_spendable_sats())
    }
}

fn legacy_signer_pk_fallback(operator_identity: &OperatorIdentity) -> Option<XOnlyPublicKey> {
    XOnlyPublicKey::from_str(&operator_identity.signer_pk_hex).ok()
}
