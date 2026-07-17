use ark_client::DeprecatedSignerMigrationReport;
use bitcoin::XOnlyPublicKey;
use bitcoin::secp256k1::rand::rngs::OsRng;

use crate::api_types::SignerMigrationResultDto;
use crate::error::{ArkResult, ArkWasmError};
use crate::persistence::operator_identity_for_connected_signer;
use crate::signer_migration::{
    MAX_SIGNER_MIGRATION_PASSES, SignerMigrationLegAccum, accumulate_pass_reports,
    build_signer_migration_result_dto, false_success_migration_message,
    migration_cooperatively_complete, pre_cutoff_cooperative_remaining,
};

use super::ArkSession;

impl ArkSession {
    pub async fn migrate_deprecated_signer_vtxos(&self) -> ArkResult<SignerMigrationResultDto> {
        self.ensure_operator_rpc_allowed()?;
        if let Some(key_discovery_warning) = self.sync_offchain_keys().await {
            return Err(ArkWasmError::Client(ark_client::Error::wallet(
                key_discovery_warning,
            )));
        }

        let mut rng = OsRng;
        let mut vtxo_total = SignerMigrationLegAccum::default();
        let mut boarding_total = SignerMigrationLegAccum::default();
        let mut settle_txids = Vec::new();
        let mut pass_count = 0_u32;
        let mut any_pass_rotated = false;

        for _ in 0..MAX_SIGNER_MIGRATION_PASSES {
            let report = self
                .client
                .migrate_deprecated_signer_vtxos(&mut rng)
                .await?;

            if report.failed() {
                let error_message = migration_leg_error_message(&report);
                return Err(ArkWasmError::Client(ark_client::Error::wallet(
                    error_message,
                )));
            }

            pass_count += 1;
            let rotated = accumulate_pass_reports(
                &mut vtxo_total,
                &mut boarding_total,
                &report,
                &mut settle_txids,
            );
            any_pass_rotated |= rotated;

            if !rotated {
                break;
            }
        }

        let deprecated_reports = self.client.deprecated_signer_status().await?;
        let remaining = pre_cutoff_cooperative_remaining(&deprecated_reports);
        let migration_complete = migration_cooperatively_complete(&remaining);

        if !migration_complete && !any_pass_rotated && remaining.has_remaining() {
            return Err(ArkWasmError::Client(ark_client::Error::wallet(
                false_success_migration_message(&remaining),
            )));
        }

        if migration_complete {
            let server_signer: XOnlyPublicKey = self.client.server_info()?.signer_pk.into();
            self.set_persisted_operator_identity(operator_identity_for_connected_signer(
                server_signer,
                self.network(),
            ));
        }

        Ok(build_signer_migration_result_dto(
            vtxo_total,
            boarding_total,
            pass_count,
            remaining,
            settle_txids,
            migration_complete,
        ))
    }
}

fn migration_leg_error_message(report: &DeprecatedSignerMigrationReport) -> String {
    if let Some(error) = report.vtxo.error.as_ref() {
        return format!("VTXO migration leg failed: {error}");
    }
    if let Some(error) = report.boarding.error.as_ref() {
        return format!("Boarding migration leg failed: {error}");
    }
    "Signer migration failed".to_string()
}

#[cfg(test)]
mod tests {
    use super::migration_leg_error_message;
    use ark_client::{DeprecatedSignerMigrationReport, MigrationLegReport};

    #[test]
    fn migration_leg_error_message_prefers_vtxo_leg() {
        let report = DeprecatedSignerMigrationReport {
            vtxo: MigrationLegReport {
                settle_txid: None,
                migrated: Vec::new(),
                deferred: Vec::new(),
                oversized: Vec::new(),
                skipped: None,
                error: Some("vtxo settle failed".to_string()),
            },
            boarding: MigrationLegReport {
                settle_txid: None,
                migrated: Vec::new(),
                deferred: Vec::new(),
                oversized: Vec::new(),
                skipped: None,
                error: None,
            },
        };
        assert!(migration_leg_error_message(&report).contains("vtxo settle failed"));
    }
}
