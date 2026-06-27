use ark_client::DEFAULT_GAP_LIMIT;
use ark_core::server::VirtualTxOutPoint;

use crate::error::ArkResult;
use crate::exit_balance::reconcile_pending_exit_deductions;
use crate::offchain_snapshot::snapshot_from_virtual_tx_outpoints;

use super::ArkSession;
use super::mappers::{current_unix_timestamp, warn_offchain_key_discovery_failed};

impl ArkSession {
    pub async fn sync_with_operator(&self) -> ArkResult<()> {
        self.sync_offchain_keys().await;
        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let all_points: Vec<VirtualTxOutPoint> = vtxo_list.all().cloned().collect();
        let snapshot = snapshot_from_virtual_tx_outpoints(
            self.client.server_info()?.dust.to_sat(),
            current_unix_timestamp(),
            all_points,
        );
        self.wallet_db.set_offchain_vtxo_snapshot(snapshot.clone());
        self.reconcile_pending_exit_deductions_with_snapshot(&snapshot)?;
        Ok(())
    }

    pub(crate) fn reconcile_pending_exit_deductions_with_snapshot(
        &self,
        snapshot: &crate::persistence::OffchainVtxoSnapshot,
    ) -> ArkResult<()> {
        let mut pending = self.wallet_db.pending_exit_deductions();
        reconcile_pending_exit_deductions(&mut pending, snapshot)?;
        self.wallet_db.set_pending_exit_deductions(pending);
        Ok(())
    }

    pub(crate) async fn sync_offchain_keys(&self) {
        if let Err(error) = self.client.discover_keys(DEFAULT_GAP_LIMIT).await {
            warn_offchain_key_discovery_failed(&error);
        }
    }
}
