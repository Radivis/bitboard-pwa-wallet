use ark_core::Vtxo;

use crate::api_types::AutonomousModeStatusDto;
use crate::cached_operator_info::CachedOperatorInfoRecord;
use crate::error::{ArkResult, ArkWasmError};
use crate::offchain_snapshot::vtxo_list_from_snapshot;
use crate::session::open::sync_onchain_wallet_for_session_open;

use super::ArkSession;
use super::exit_materials_prefetch::autonomous_exit_materials_status;

impl ArkSession {
    pub(crate) fn autonomous_mode(&self) -> bool {
        self.autonomous_mode.get()
    }

    pub(crate) fn set_autonomous_mode(&self, active: bool) {
        self.autonomous_mode.set(active);
    }

    pub(crate) fn ensure_operator_rpc_allowed(&self) -> ArkResult<()> {
        if self.autonomous_mode() {
            return Err(ArkWasmError::AutonomousModeBlocksOperatorRpc);
        }
        Ok(())
    }

    pub async fn enter_autonomous_mode(&self) -> ArkResult<()> {
        let cached = self
            .wallet_db
            .cached_operator_info()
            .ok_or(ArkWasmError::AutonomousOperatorInfoMissing)?;
        let server_info = cached.to_server_info()?;
        self.client.install_cached_server_info(server_info)?;
        sync_onchain_wallet_for_session_open(&self.client).await;
        self.set_autonomous_mode(true);
        Ok(())
    }

    pub async fn exit_autonomous_mode(&self) -> ArkResult<()> {
        if !self.autonomous_mode() {
            return Ok(());
        }
        self.set_autonomous_mode(false);
        if let Err(error) = self.client.refresh_server_info().await {
            #[cfg(target_arch = "wasm32")]
            web_sys::console::warn_1(
                &format!("Failed to refresh operator info when leaving autonomous mode: {error}")
                    .into(),
            );
            #[cfg(not(target_arch = "wasm32"))]
            let _ = error;
        }
        let _ = self.sync_with_operator().await;
        Ok(())
    }

    pub fn autonomous_mode_status(&self) -> ArkResult<AutonomousModeStatusDto> {
        let snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot;
        let (eligible_count, materials_ready_count, materials_missing_count) =
            autonomous_exit_materials_status(snapshot.as_ref());
        Ok(AutonomousModeStatusDto {
            active: self.autonomous_mode(),
            eligible_count,
            materials_ready_count,
            materials_missing_count,
            cached_operator_info_present: self.wallet_db.cached_operator_info().is_some(),
        })
    }

    pub(crate) fn offchain_script_map(
        &self,
    ) -> ArkResult<std::collections::HashMap<bitcoin::ScriptBuf, Vtxo>> {
        let ark_addresses = self.client.get_offchain_addresses()?;
        Ok(ark_addresses
            .iter()
            .map(|(address, vtxo)| (address.to_p2tr_script_pubkey(), vtxo.clone()))
            .collect())
    }

    pub(crate) fn snapshot_vtxo_list_and_script_map(
        &self,
    ) -> ArkResult<(
        ark_core::VtxoList,
        std::collections::HashMap<bitcoin::ScriptBuf, Vtxo>,
    )> {
        let snapshot = self
            .wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .ok_or_else(|| ArkWasmError::Snapshot("offchain snapshot missing".into()))?;
        let vtxo_list = vtxo_list_from_snapshot(&snapshot)?;
        let script_map = self.offchain_script_map()?;
        Ok((vtxo_list, script_map))
    }

    pub(crate) fn persist_cached_operator_info_from_client(&self) -> ArkResult<()> {
        let server_info = self.client.server_info()?;
        self.wallet_db
            .set_cached_operator_info(CachedOperatorInfoRecord::from_server_info(&server_info));
        Ok(())
    }
}
