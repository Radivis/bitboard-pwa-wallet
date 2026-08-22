use crate::api_types::{
    UnilateralExitAutomationPrefsDto, UnilateralExitFailureDto,
    UnilateralExitFrontendPersistenceDto, UnilateralExitJobDto, UnilateralExitLeafOutpointDto,
};
use crate::persistence::{
    UnilateralExitAutomationPrefsRecord, UnilateralExitFailureRecord,
    UnilateralExitFrontendPersistence, UnilateralExitJobRecord, UnilateralExitLeafOutpointRecord,
};

use super::ArkSession;

fn leaf_outpoint_to_dto(record: UnilateralExitLeafOutpointRecord) -> UnilateralExitLeafOutpointDto {
    UnilateralExitLeafOutpointDto {
        txid: record.txid,
        vout: record.vout,
    }
}

fn leaf_outpoint_from_dto(dto: UnilateralExitLeafOutpointDto) -> UnilateralExitLeafOutpointRecord {
    UnilateralExitLeafOutpointRecord {
        txid: dto.txid,
        vout: dto.vout,
    }
}

fn job_to_dto(job: UnilateralExitJobRecord) -> UnilateralExitJobDto {
    UnilateralExitJobDto {
        selected_leaf_outpoints: job
            .selected_leaf_outpoints
            .into_iter()
            .map(leaf_outpoint_to_dto)
            .collect(),
        current_step_relayed_since_unix: job.current_step_relayed_since_unix,
        job_started_at_unix: job.job_started_at_unix,
    }
}

fn job_from_dto(dto: UnilateralExitJobDto) -> UnilateralExitJobRecord {
    UnilateralExitJobRecord {
        selected_leaf_outpoints: dto
            .selected_leaf_outpoints
            .into_iter()
            .map(leaf_outpoint_from_dto)
            .collect(),
        current_step_relayed_since_unix: dto.current_step_relayed_since_unix,
        job_started_at_unix: dto.job_started_at_unix,
    }
}

fn prefs_to_dto(prefs: UnilateralExitAutomationPrefsRecord) -> UnilateralExitAutomationPrefsDto {
    UnilateralExitAutomationPrefsDto {
        enabled: prefs.enabled,
        fee_preset_label: prefs.fee_preset_label,
        max_fee_rate_sat_per_vb: prefs.max_fee_rate_sat_per_vb,
    }
}

fn prefs_from_dto(dto: UnilateralExitAutomationPrefsDto) -> UnilateralExitAutomationPrefsRecord {
    UnilateralExitAutomationPrefsRecord {
        enabled: dto.enabled,
        fee_preset_label: dto.fee_preset_label,
        max_fee_rate_sat_per_vb: dto.max_fee_rate_sat_per_vb,
    }
}

fn failure_to_dto(failure: UnilateralExitFailureRecord) -> UnilateralExitFailureDto {
    UnilateralExitFailureDto {
        selected_leaf_outpoints: failure
            .selected_leaf_outpoints
            .into_iter()
            .map(leaf_outpoint_to_dto)
            .collect(),
        job_started_at_unix: failure.job_started_at_unix,
        detected_at_unix: failure.detected_at_unix,
        reason_code: failure.reason_code,
        detail_message: failure.detail_message,
        vtxo_ids: failure.vtxo_ids,
    }
}

fn failure_from_dto(dto: UnilateralExitFailureDto) -> UnilateralExitFailureRecord {
    UnilateralExitFailureRecord {
        selected_leaf_outpoints: dto
            .selected_leaf_outpoints
            .into_iter()
            .map(leaf_outpoint_from_dto)
            .collect(),
        job_started_at_unix: dto.job_started_at_unix,
        detected_at_unix: dto.detected_at_unix,
        reason_code: dto.reason_code,
        detail_message: dto.detail_message,
        vtxo_ids: dto.vtxo_ids,
    }
}

fn frontend_to_dto(
    bundle: UnilateralExitFrontendPersistence,
) -> UnilateralExitFrontendPersistenceDto {
    UnilateralExitFrontendPersistenceDto {
        job: job_to_dto(bundle.job),
        automation_prefs: prefs_to_dto(bundle.automation_prefs),
        last_failure: bundle.last_failure.map(failure_to_dto),
    }
}

fn frontend_from_dto(
    dto: UnilateralExitFrontendPersistenceDto,
) -> UnilateralExitFrontendPersistence {
    UnilateralExitFrontendPersistence {
        job: job_from_dto(dto.job),
        automation_prefs: prefs_from_dto(dto.automation_prefs),
        last_failure: dto.last_failure.map(failure_from_dto),
    }
}

impl ArkSession {
    pub fn unilateral_exit_frontend(&self) -> Option<UnilateralExitFrontendPersistenceDto> {
        self.wallet_db
            .unilateral_exit_frontend()
            .map(frontend_to_dto)
    }

    pub fn set_unilateral_exit_frontend(&self, dto: UnilateralExitFrontendPersistenceDto) {
        self.wallet_db
            .set_unilateral_exit_frontend(frontend_from_dto(dto));
    }

    pub fn set_unilateral_exit_job(&self, dto: UnilateralExitJobDto) {
        self.wallet_db.set_unilateral_exit_job(job_from_dto(dto));
    }

    pub fn set_unilateral_exit_automation_prefs(&self, dto: UnilateralExitAutomationPrefsDto) {
        self.wallet_db
            .set_unilateral_exit_automation_prefs(prefs_from_dto(dto));
    }

    pub fn set_unilateral_exit_failure(&self, dto: Option<UnilateralExitFailureDto>) {
        self.wallet_db
            .set_unilateral_exit_failure(dto.map(failure_from_dto));
    }
}
