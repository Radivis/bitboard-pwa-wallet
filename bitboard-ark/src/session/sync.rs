use std::collections::{HashMap, HashSet};
use std::sync::MutexGuard;

use ark_client::DEFAULT_GAP_LIMIT;
use ark_core::server::VirtualTxOutPoint;
use ark_core::{ArkAddress, Vtxo, VtxoList};
use bitcoin::{OutPoint, ScriptBuf};

use crate::api_types::OperatorSyncResultDto;
use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::reconcile_pending_exit_deductions;
use crate::incremental_vtxo_sync::{
    derivation_index_is_in_recent_sync_window, full_vtxo_list_reconcile_due,
    user_facing_operator_sync_uses_light_fetch,
};
use crate::offchain_snapshot::{
    clear_indexer_unrolled_without_local_finality, dedupe_virtual_tx_outpoints,
    live_snapshot_outpoints, merge_incremental_vtxo_snapshot, merge_sticky_spent_flags,
    merge_sticky_unrolled_flags, overlay_changed_vtxo_rows,
    snapshot_from_virtual_tx_outpoints_with_script_lookup, vtxo_list_from_snapshot,
};
use crate::persistence::OffchainVtxoSnapshot;

use super::ArkSession;
use super::mappers::{current_unix_timestamp, warn_offchain_key_discovery_failed};
use super::unilateral_exit::watch_reconcile::{
    merge_exiting_vtxo_sync_warnings, reconcile_exiting_vtxo_records,
    reconcile_exiting_vtxos_spent_on_esplora,
};

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

pub(crate) fn operator_sync_result_idle() -> OperatorSyncResultDto {
    OperatorSyncResultDto {
        key_discovery_warning: None,
        exiting_vtxo_warning: None,
        operator_config_trust_pending: false,
        full_reconcile_due: false,
    }
}

struct LightVtxoFetch {
    points: Vec<VirtualTxOutPoint>,
    script_map: HashMap<ScriptBuf, Vtxo>,
}

enum SnapshotCommit {
    /// Full unfiltered list replaces history. A following catch-up merge restores rows that landed during the fetch.
    Replace,
    /// Light finalize: write flag and material changes without clobbering a newer snapshot.
    OverlayOnto { base: OffchainVtxoSnapshot },
}

impl ArkSession {
    pub async fn sync_with_operator(&self) -> ArkResult<OperatorSyncResultDto> {
        self.sync_with_operator_scheduling(false).await
    }

    pub async fn sync_with_operator_scheduling(
        &self,
        schedule_background_full: bool,
    ) -> ArkResult<OperatorSyncResultDto> {
        let (_, sync_result) = self
            .sync_with_operator_and_vtxo_list(schedule_background_full)
            .await?;
        Ok(sync_result)
    }

    /// Like [`sync_with_operator_scheduling`], but also returns the VTXO list used for prefetch.
    ///
    /// With a snapshot, this is the light fetch even when `schedule_background_full` is set.
    /// `full_reconcile_due` tells the host to run [`Self::reconcile_full_offchain_vtxo_list`]
    /// in the background.
    pub(crate) async fn sync_with_operator_and_vtxo_list(
        &self,
        schedule_background_full: bool,
    ) -> ArkResult<(VtxoList, OperatorSyncResultDto)> {
        self.ensure_operator_rpc_allowed()?;
        self.client
            .refresh_server_info()
            .await
            .map_err(ArkWasmError::Client)?;
        let server_info = self.client.server_info()?;
        let new_digest = server_info.digest.clone();

        if self.should_block_sync_persist_for_operator_trust(&new_digest) {
            return self
                .sync_with_operator_trust_pending_staging(&server_info)
                .await;
        }

        let key_discovery_warning = self.sync_offchain_keys().await;
        let prior_snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone();
        let now = current_unix_timestamp();
        let full_reconcile_due =
            full_vtxo_list_reconcile_due(prior_snapshot.as_ref(), now, schedule_background_full);

        match prior_snapshot {
            Some(prior) if user_facing_operator_sync_uses_light_fetch(Some(&prior)) => {
                self.sync_offchain_vtxos_light(prior, key_discovery_warning, full_reconcile_due)
                    .await
            }
            _ => {
                self.sync_offchain_vtxos_blocking_full_list(key_discovery_warning, now)
                    .await
            }
        }
    }

    /// Background full unfiltered list, then a catch-up light fetch so a board or intent during the long fetch is kept.
    ///
    /// `full_listed_at` is stamped only after catch-up succeeds, so a failed reconcile stays due.
    pub async fn reconcile_full_offchain_vtxo_list(&self) -> ArkResult<()> {
        self.ensure_operator_rpc_allowed()?;
        self.client
            .refresh_server_info()
            .await
            .map_err(ArkWasmError::Client)?;
        let server_info = self.client.server_info()?;
        if self.should_block_sync_persist_for_operator_trust(&server_info.digest) {
            return Ok(());
        }

        let now = current_unix_timestamp();
        let (vtxo_list, script_map) = self.client.list_vtxos().await?;
        let prior_snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone();
        let previous_full_listed_at = prior_snapshot
            .as_ref()
            .map(|snapshot| snapshot.full_listed_at)
            .unwrap_or(0);
        let all_points: Vec<VirtualTxOutPoint> = vtxo_list.all().cloned().collect();
        let mut snapshot = snapshot_from_virtual_tx_outpoints_with_script_lookup(
            server_info.dust.to_sat(),
            now,
            all_points,
            |script| script_map.get(script).map(|vtxo| vtxo.server_pk()),
        );
        snapshot.full_listed_at = previous_full_listed_at;
        self.finalize_operator_sync_snapshot(
            snapshot,
            prior_snapshot.as_ref(),
            None,
            false,
            SnapshotCommit::Replace,
        )
        .await?;

        let Some(listed) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() else {
            return Ok(());
        };
        self.sync_offchain_vtxos_light(listed, None, false).await?;
        self.stamp_full_listed_at(current_unix_timestamp());
        Ok(())
    }

    async fn sync_offchain_vtxos_light(
        &self,
        prior: OffchainVtxoSnapshot,
        key_discovery_warning: Option<String>,
        full_reconcile_due: bool,
    ) -> ArkResult<(VtxoList, OperatorSyncResultDto)> {
        let fetch = self.fetch_light_vtxo_delta(&prior).await?;
        let (merged, merge_base) = self.stage_light_vtxo_merge(prior, &fetch);
        self.finalize_operator_sync_snapshot(
            merged,
            Some(&merge_base),
            key_discovery_warning,
            full_reconcile_due,
            SnapshotCommit::OverlayOnto {
                base: merge_base.clone(),
            },
        )
        .await
    }

    async fn sync_offchain_vtxos_blocking_full_list(
        &self,
        key_discovery_warning: Option<String>,
        now: i64,
    ) -> ArkResult<(VtxoList, OperatorSyncResultDto)> {
        let server_info = self.client.server_info()?;
        let (vtxo_list, script_map) = self.client.list_vtxos().await?;
        let prior_snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone();
        let all_points: Vec<VirtualTxOutPoint> = vtxo_list.all().cloned().collect();
        let mut snapshot = snapshot_from_virtual_tx_outpoints_with_script_lookup(
            server_info.dust.to_sat(),
            now,
            all_points,
            |script| script_map.get(script).map(|vtxo| vtxo.server_pk()),
        );
        snapshot.full_listed_at = now;
        self.finalize_operator_sync_snapshot(
            snapshot,
            prior_snapshot.as_ref(),
            key_discovery_warning,
            false,
            SnapshotCommit::Replace,
        )
        .await
    }

    async fn fetch_light_vtxo_delta(
        &self,
        snapshot: &OffchainVtxoSnapshot,
    ) -> ArkResult<LightVtxoFetch> {
        let script_map = self.offchain_script_map()?;
        let requested_live_outpoints: HashSet<OutPoint> =
            live_snapshot_outpoints(snapshot).into_iter().collect();
        let mut points = Vec::new();
        if !requested_live_outpoints.is_empty() {
            let (list, _) = self
                .client
                .list_vtxos_for_outpoints(requested_live_outpoints.iter().copied().collect())
                .await?;
            points.extend(list.all().cloned());
        }
        let recent_addresses = self.recent_offchain_addresses()?;
        if !recent_addresses.is_empty() {
            let list = self
                .client
                .list_vtxos_for_addresses(recent_addresses.into_iter())
                .await?;
            points.extend(list.all().cloned());
        }
        Ok(LightVtxoFetch {
            points: dedupe_virtual_tx_outpoints(points),
            script_map,
        })
    }

    fn recent_offchain_addresses(&self) -> ArkResult<Vec<ArkAddress>> {
        let next_index = self.client.peek_next_offchain_derivation_index();
        let addresses = self.client.get_offchain_addresses()?;
        Ok(addresses
            .into_iter()
            .filter_map(|(address, vtxo)| {
                let derivation_index = self.client.derivation_index_for_pk(&vtxo.owner_pk())?;
                derivation_index_is_in_recent_sync_window(
                    derivation_index,
                    next_index,
                    DEFAULT_GAP_LIMIT,
                )
                .then_some(address)
            })
            .collect())
    }

    async fn finalize_operator_sync_snapshot(
        &self,
        mut snapshot: OffchainVtxoSnapshot,
        prior_snapshot: Option<&OffchainVtxoSnapshot>,
        key_discovery_warning: Option<String>,
        full_reconcile_due: bool,
        commit: SnapshotCommit,
    ) -> ArkResult<(VtxoList, OperatorSyncResultDto)> {
        let pending_unilateral_outpoints: Vec<(String, u32)> = self
            .wallet_db
            .pending_exit_deductions()
            .iter()
            .filter_map(|record| {
                if record.kind != crate::persistence::PendingExitKind::Unilateral {
                    return None;
                }
                Some((record.vtxo_txid.clone()?, record.vout?))
            })
            .collect();
        crate::unilateral_exit_materials::reinject_pending_unilateral_exit_records(
            prior_snapshot,
            &mut snapshot,
            pending_unilateral_outpoints,
        );
        crate::unilateral_exit_materials::merge_unilateral_exit_materials_maps(
            prior_snapshot,
            &mut snapshot,
        );
        let sticky_unroll_hosts = crate::offchain_snapshot::confirmed_unroll_sticky_host_txids(
            &self.wallet_db.host_tx_observations(),
            &self.wallet_db.vtxo_exit_records(),
        );
        merge_sticky_unrolled_flags(prior_snapshot, &mut snapshot, &sticky_unroll_hosts);
        merge_sticky_spent_flags(prior_snapshot, &mut snapshot);
        let esplora_reconcile =
            reconcile_exiting_vtxos_spent_on_esplora(self, &mut snapshot).await?;
        let mut unroll_hosts_to_keep = sticky_unroll_hosts;
        unroll_hosts_to_keep.extend(esplora_reconcile.chain_visible_unrolled_hosts);
        clear_indexer_unrolled_without_local_finality(&mut snapshot, &unroll_hosts_to_keep);
        let reconcile = reconcile_exiting_vtxo_records(self, snapshot, prior_snapshot).await?;
        snapshot = reconcile.snapshot;
        let esplora_healed_outpoints = esplora_reconcile.spent_outpoints;
        let prefetch_list = vtxo_list_from_snapshot(&snapshot)?;
        let materials_warning = super::unilateral_exit::materials_prefetch::prefetch_unilateral_exit_materials_for_snapshot(
            self,
            &mut snapshot,
            &prefetch_list,
        )
        .await;
        self.commit_operator_snapshot(snapshot.clone(), commit);
        let viability_warnings = self.reconcile_host_tx_finality().await?;
        let snapshot = self
            .wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .unwrap_or(snapshot);
        if !esplora_healed_outpoints.is_empty() {
            self.clear_pending_unilateral_exits_for_outpoints(&esplora_healed_outpoints);
        }
        self.reconcile_pending_exit_deductions_with_snapshot(&snapshot)?;
        self.reconcile_pending_batch_intents().await?;
        self.persist_cached_operator_info_from_client()?;
        let mut sync_warnings = reconcile.warnings;
        sync_warnings.extend(viability_warnings);
        let sync_result = OperatorSyncResultDto {
            key_discovery_warning: combine_operator_sync_warning_messages(
                key_discovery_warning,
                merge_exiting_vtxo_sync_warnings(sync_warnings),
            )
            .or(materials_warning),
            exiting_vtxo_warning: None,
            operator_config_trust_pending: false,
            full_reconcile_due,
        };
        Ok((prefetch_list, sync_result))
    }

    /// Merge `fetch` into the current snapshot without writing it.
    ///
    /// Finalize may restore a row to this base — indexer `is_unrolled` cleared back to the
    /// stored value, or exit materials pruned. Overlay skips a row that matches the base.
    /// Persisting the merge first would keep the indexer flag, including when finalize fails.
    fn stage_light_vtxo_merge(
        &self,
        fallback: OffchainVtxoSnapshot,
        fetch: &LightVtxoFetch,
    ) -> (OffchainVtxoSnapshot, OffchainVtxoSnapshot) {
        let _apply = self.lock_vtxo_snapshot_apply();
        let merge_base = self
            .wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .clone()
            .unwrap_or(fallback);
        let merged = merge_incremental_vtxo_snapshot(
            &merge_base,
            fetch.points.iter().cloned(),
            current_unix_timestamp(),
            |script| fetch.script_map.get(script).map(|vtxo| vtxo.server_pk()),
        );
        (merged, merge_base)
    }

    fn commit_operator_snapshot(&self, snapshot: OffchainVtxoSnapshot, commit: SnapshotCommit) {
        let _apply = self.lock_vtxo_snapshot_apply();
        match commit {
            SnapshotCommit::Replace => {
                self.wallet_db.set_offchain_vtxo_snapshot(snapshot);
            }
            SnapshotCommit::OverlayOnto { base } => {
                let latest = self.wallet_db.snapshot().offchain_vtxo_snapshot;
                let Some(latest) = latest else {
                    self.wallet_db.set_offchain_vtxo_snapshot(snapshot);
                    return;
                };
                let overlaid = overlay_changed_vtxo_rows(&latest, &base, &snapshot);
                self.wallet_db.set_offchain_vtxo_snapshot(overlaid);
            }
        }
    }

    /// Host-tx finality probed Esplora outside the apply lock. Overlay its flag changes onto the latest snapshot.
    pub(crate) fn commit_overlaid_snapshot(
        &self,
        base: &OffchainVtxoSnapshot,
        finalized: OffchainVtxoSnapshot,
    ) {
        self.commit_operator_snapshot(
            finalized,
            SnapshotCommit::OverlayOnto { base: base.clone() },
        );
    }

    fn stamp_full_listed_at(&self, full_listed_at: i64) {
        let _apply = self.lock_vtxo_snapshot_apply();
        let Some(mut snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot else {
            return;
        };
        snapshot.full_listed_at = full_listed_at;
        self.wallet_db.set_offchain_vtxo_snapshot(snapshot);
    }

    fn lock_vtxo_snapshot_apply(&self) -> MutexGuard<'_, ()> {
        self.vtxo_snapshot_apply
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    async fn sync_with_operator_trust_pending_staging(
        &self,
        server_info: &ark_core::server::Info,
    ) -> ArkResult<(VtxoList, OperatorSyncResultDto)> {
        self.stage_operator_trust_from_server_info(server_info);
        let sync_result = OperatorSyncResultDto {
            key_discovery_warning: None,
            exiting_vtxo_warning: None,
            operator_config_trust_pending: true,
            full_reconcile_due: false,
        };
        let empty_vtxo_list = VtxoList::new(server_info.dust, Vec::new());
        Ok((empty_vtxo_list, sync_result))
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
