use ark_client::DEFAULT_GAP_LIMIT;
use ark_core::server::VirtualTxOutPoint;

use crate::api_types::OperatorSyncResultDto;
use crate::error::ArkResult;
use crate::exit_balance::reconcile_pending_exit_deductions;
use crate::offchain_snapshot::{
    merge_sticky_unrolled_flags, snapshot_from_virtual_tx_outpoints_with_script_lookup,
};

use super::ArkSession;
use super::exit_watch_reconcile::{
    merge_exiting_vtxo_sync_warnings, reconcile_exiting_vtxo_watches,
};
use super::mappers::{current_unix_timestamp, warn_offchain_key_discovery_failed};

/// User-facing warning when [`ark_client::Client::discover_keys`] fails during operator sync.
pub(crate) fn operator_sync_key_discovery_warning(error: &ark_client::Error) -> String {
    format!(
        "Offchain receive keys could not be refreshed: {error}. Balance may be incomplete until the next successful sync."
    )
}

/// Mirrors frontend `mergeArkadeSyncWarningMessages` (contract tested here).
#[allow(dead_code)]
pub(crate) fn combine_operator_sync_warning_messages(
    key_discovery_warning: Option<String>,
    exiting_vtxo_warning: Option<String>,
) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(warning) = key_discovery_warning {
        parts.push(warning);
    }
    if let Some(warning) = exiting_vtxo_warning {
        parts.push(warning);
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n"))
    }
}

impl ArkSession {
    pub async fn sync_with_operator(&self) -> ArkResult<OperatorSyncResultDto> {
        let key_discovery_warning = self.sync_offchain_keys().await;
        let (vtxo_list, script_map) = self.client.list_vtxos().await?;
        let prior_snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone();
        let all_points: Vec<VirtualTxOutPoint> = vtxo_list.all().cloned().collect();
        let mut snapshot = snapshot_from_virtual_tx_outpoints_with_script_lookup(
            self.client.server_info()?.dust.to_sat(),
            current_unix_timestamp(),
            all_points,
            |script| script_map.get(script).map(|vtxo| vtxo.server_pk()),
        );
        merge_sticky_unrolled_flags(prior_snapshot.as_ref(), &mut snapshot);
        let reconcile =
            reconcile_exiting_vtxo_watches(self, snapshot, prior_snapshot.as_ref()).await?;
        snapshot = reconcile.snapshot;
        self.wallet_db.set_offchain_vtxo_snapshot(snapshot.clone());
        self.wallet_db
            .set_unilateral_exit_watches(reconcile.watches.clone());
        self.reconcile_pending_exit_deductions_with_snapshot(&snapshot)?;
        Ok(OperatorSyncResultDto {
            key_discovery_warning,
            exiting_vtxo_warning: merge_exiting_vtxo_sync_warnings(reconcile.warnings),
        })
    }

    pub(crate) fn reconcile_pending_exit_deductions_with_snapshot(
        &self,
        snapshot: &crate::persistence::OffchainVtxoSnapshot,
    ) -> ArkResult<()> {
        let mut pending = self.wallet_db.pending_exit_deductions();
        let gross_offchain_spendable_sats =
            self.signer_aware_gross_offchain_spendable_from_snapshot(snapshot)?;
        reconcile_pending_exit_deductions(&mut pending, snapshot, gross_offchain_spendable_sats)?;
        self.wallet_db.set_pending_exit_deductions(pending);
        Ok(())
    }

    pub(crate) async fn sync_offchain_keys(&self) -> Option<String> {
        match self.client.discover_keys(DEFAULT_GAP_LIMIT).await {
            Ok(_) => None,
            Err(error) => {
                warn_offchain_key_discovery_failed(&error);
                Some(operator_sync_key_discovery_warning(&error))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{combine_operator_sync_warning_messages, operator_sync_key_discovery_warning};

    #[test]
    fn operator_sync_key_discovery_warning_includes_error_detail() {
        let error = ark_client::Error::wallet("indexer timeout");
        let warning = operator_sync_key_discovery_warning(&error);
        assert!(warning.contains("indexer timeout"));
        assert!(warning.contains("Offchain receive keys could not be refreshed"));
        assert!(warning.contains("Balance may be incomplete"));
    }

    #[test]
    fn combine_operator_sync_warning_messages_joins_both_sources() {
        let combined = combine_operator_sync_warning_messages(
            Some("key warning".to_string()),
            Some("exit warning".to_string()),
        );
        assert_eq!(combined.as_deref(), Some("key warning\nexit warning"));
    }

    #[test]
    fn combine_operator_sync_warning_messages_returns_none_when_empty() {
        assert!(combine_operator_sync_warning_messages(None, None).is_none());
    }
}
