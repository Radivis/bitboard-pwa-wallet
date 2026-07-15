use crate::api_types::{OperatorConfigDiffResultDto, OperatorTrustStatusDto};
use crate::cached_operator_info::CachedOperatorInfoRecord;
use crate::error::{ArkResult, ArkWasmError};
use crate::operator_config_diff::operator_config_diff;

use super::ArkSession;

impl ArkSession {
    pub fn operator_trust_status(&self) -> OperatorTrustStatusDto {
        let accepted = self.wallet_db.cached_operator_info();
        let pending = self.wallet_db.pending_operator_info();
        let operator_trust_pending = self.wallet_db.operator_trust_pending();
        let active = self.autonomous_mode();
        OperatorTrustStatusDto {
            operator_trust_pending,
            reviewing_in_autonomous: operator_trust_pending && active,
            accepted_digest: accepted.as_ref().map(|info| info.digest.clone()),
            pending_digest: pending.as_ref().map(|info| info.digest.clone()),
        }
    }

    pub fn operator_config_diff(&self) -> ArkResult<OperatorConfigDiffResultDto> {
        if !self.wallet_db.operator_trust_pending() {
            return Ok(OperatorConfigDiffResultDto {
                entries: Vec::new(),
            });
        }
        let accepted = self.wallet_db.cached_operator_info().ok_or_else(|| {
            ArkWasmError::Snapshot("accepted operator info missing while trust is pending".into())
        })?;
        let pending = self.wallet_db.pending_operator_info().ok_or_else(|| {
            ArkWasmError::Snapshot("pending operator info missing while trust is pending".into())
        })?;
        Ok(OperatorConfigDiffResultDto {
            entries: operator_config_diff(&accepted, &pending),
        })
    }

    pub async fn accept_pending_operator_config(&self) -> ArkResult<()> {
        if !self.wallet_db.operator_trust_pending() {
            return Err(ArkWasmError::Snapshot(
                "no pending operator config to accept".into(),
            ));
        }
        let pending = self.wallet_db.pending_operator_info().ok_or_else(|| {
            ArkWasmError::Snapshot("pending operator info missing while trust is pending".into())
        })?;
        if self.autonomous_mode() {
            self.exit_autonomous_mode_for_trust_accept().await?;
        }
        self.wallet_db.set_cached_operator_info(pending);
        self.wallet_db.clear_operator_trust_state();
        self.sync_with_operator().await?;
        Ok(())
    }

    pub async fn review_operator_config_in_autonomous_mode(&self) -> ArkResult<()> {
        if !self.wallet_db.operator_trust_pending() {
            return Err(ArkWasmError::Snapshot(
                "operator trust is not pending".into(),
            ));
        }
        self.enter_autonomous_mode().await?;
        Ok(())
    }

    pub(crate) async fn exit_autonomous_mode_for_trust_accept(&self) -> ArkResult<()> {
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
        Ok(())
    }

    pub(crate) fn stage_operator_trust_from_server_info(
        &self,
        server_info: &ark_core::server::Info,
    ) {
        self.wallet_db
            .stage_operator_trust_pending(CachedOperatorInfoRecord::from_server_info(server_info));
    }

    pub(crate) fn should_block_sync_persist_for_operator_trust(&self, new_digest: &str) -> bool {
        crate::operator_config_diff::should_block_sync_persist_for_operator_trust(
            self.wallet_db.operator_trust_pending(),
            self.wallet_db.cached_operator_info().as_ref(),
            new_digest,
        )
    }
}
