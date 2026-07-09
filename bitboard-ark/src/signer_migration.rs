use ark_client::{DeprecatedSignerMigrationReport, DeprecatedSignerReport, MigrationLegReport};
use ark_core::server::DeprecatedSignerStatus;

use crate::api_types::{SignerMigrationLegResultDto, SignerMigrationResultDto};

/// Maximum cooperative migration passes per user action (ark-client settles up to
/// [`ark_client::MAX_VTXOS_PER_SETTLEMENT`] inputs per leg per pass).
pub const MAX_SIGNER_MIGRATION_PASSES: u32 = 20;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PreCutoffCooperativeRemaining {
    pub vtxo_count: usize,
    pub vtxo_sats: u64,
    pub boarding_count: usize,
    pub boarding_sats: u64,
}

impl PreCutoffCooperativeRemaining {
    pub fn has_remaining(&self) -> bool {
        self.vtxo_count > 0 || self.boarding_count > 0
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SignerMigrationLegAccum {
    pub migrated_count: usize,
    pub migrated_sats: u64,
    pub deferred_count: usize,
    pub deferred_sats: u64,
    pub oversized_count: usize,
    pub oversized_sats: u64,
    pub last_settle_txid: Option<String>,
    pub last_error: Option<String>,
}

pub fn pre_cutoff_cooperative_remaining(
    reports: &[DeprecatedSignerReport],
) -> PreCutoffCooperativeRemaining {
    let mut remaining = PreCutoffCooperativeRemaining::default();
    for report in reports {
        if !is_pre_cutoff_cooperative_status(report.status) {
            continue;
        }
        remaining.vtxo_count += report.vtxo_count;
        remaining.vtxo_sats = remaining
            .vtxo_sats
            .saturating_add(report.vtxo_value.to_sat());
        remaining.boarding_count += report.boarding_count;
        remaining.boarding_sats = remaining
            .boarding_sats
            .saturating_add(report.boarding_value.to_sat());
    }
    remaining
}

fn is_pre_cutoff_cooperative_status(status: DeprecatedSignerStatus) -> bool {
    matches!(
        status,
        DeprecatedSignerStatus::Migratable | DeprecatedSignerStatus::DueNow
    )
}

pub fn aggregate_leg_report(leg: &MigrationLegReport) -> SignerMigrationLegAccum {
    let (migrated_count, migrated_sats) = sum_migration_refs(&leg.migrated);
    let (deferred_count, deferred_sats) = sum_migration_refs(&leg.deferred);
    let (oversized_count, oversized_sats) = sum_migration_refs(&leg.oversized);
    SignerMigrationLegAccum {
        migrated_count,
        migrated_sats,
        deferred_count,
        deferred_sats,
        oversized_count,
        oversized_sats,
        last_settle_txid: leg.settle_txid.map(|txid| txid.to_string()),
        last_error: leg.error.clone(),
    }
}

fn sum_migration_refs(refs: &[ark_client::MigrationVtxoRef]) -> (usize, u64) {
    let count = refs.len();
    let sats = refs.iter().fold(0_u64, |total, item| {
        total.saturating_add(item.amount.to_sat())
    });
    (count, sats)
}

pub fn merge_leg_accum(total: &mut SignerMigrationLegAccum, pass: &SignerMigrationLegAccum) {
    total.migrated_count += pass.migrated_count;
    total.migrated_sats = total.migrated_sats.saturating_add(pass.migrated_sats);
    // Deferred/oversized reflect the latest pass only; migrated totals accumulate across passes.
    total.deferred_count = pass.deferred_count;
    total.deferred_sats = pass.deferred_sats;
    total.oversized_count = pass.oversized_count;
    total.oversized_sats = pass.oversized_sats;
    if pass.last_settle_txid.is_some() {
        total.last_settle_txid = pass.last_settle_txid.clone();
    }
    if pass.last_error.is_some() {
        total.last_error = pass.last_error.clone();
    }
}

pub fn migration_cooperatively_complete(remaining: &PreCutoffCooperativeRemaining) -> bool {
    !remaining.has_remaining()
}

pub fn false_success_migration_message(remaining: &PreCutoffCooperativeRemaining) -> String {
    format!(
        "Cooperative signer migration settled no funds while {vtxo_count} deprecated-signer VTXO(s) \
         ({vtxo_sats} sats) and {boarding_count} boarding output(s) ({boarding_sats} sats) still \
         require migration. Sync Arkade and try again.",
        vtxo_count = remaining.vtxo_count,
        vtxo_sats = remaining.vtxo_sats,
        boarding_count = remaining.boarding_count,
        boarding_sats = remaining.boarding_sats,
    )
}

pub fn build_signer_migration_result_dto(
    vtxo_leg: SignerMigrationLegAccum,
    boarding_leg: SignerMigrationLegAccum,
    pass_count: u32,
    remaining: PreCutoffCooperativeRemaining,
    settle_txids: Vec<String>,
    migration_complete: bool,
) -> SignerMigrationResultDto {
    SignerMigrationResultDto {
        vtxo_leg: leg_accum_to_dto(&vtxo_leg),
        boarding_leg: leg_accum_to_dto(&boarding_leg),
        pass_count,
        migration_complete,
        pass_cap_reached: pass_count == MAX_SIGNER_MIGRATION_PASSES && !migration_complete,
        remaining_pre_cutoff_vtxo_count: remaining.vtxo_count as u32,
        remaining_pre_cutoff_sats: remaining.vtxo_sats,
        remaining_pre_cutoff_boarding_count: remaining.boarding_count as u32,
        settle_txids,
    }
}

fn leg_accum_to_dto(accum: &SignerMigrationLegAccum) -> SignerMigrationLegResultDto {
    SignerMigrationLegResultDto {
        migrated_count: accum.migrated_count as u32,
        migrated_sats: accum.migrated_sats,
        deferred_count: accum.deferred_count as u32,
        deferred_sats: accum.deferred_sats,
        oversized_count: accum.oversized_count as u32,
        oversized_sats: accum.oversized_sats,
        settle_txid: accum.last_settle_txid.clone(),
        error: accum.last_error.clone(),
    }
}

pub fn accumulate_pass_reports(
    vtxo_total: &mut SignerMigrationLegAccum,
    boarding_total: &mut SignerMigrationLegAccum,
    report: &DeprecatedSignerMigrationReport,
    settle_txids: &mut Vec<String>,
) -> bool {
    merge_leg_accum(vtxo_total, &aggregate_leg_report(&report.vtxo));
    merge_leg_accum(boarding_total, &aggregate_leg_report(&report.boarding));
    for txid in report.settle_txids() {
        let txid_hex = txid.to_string();
        if !settle_txids.contains(&txid_hex) {
            settle_txids.push(txid_hex);
        }
    }
    report.rotated()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_client::MigrationVtxoRef;
    use bitcoin::Amount;
    use bitcoin::OutPoint;
    use bitcoin::Txid;
    use bitcoin::XOnlyPublicKey;
    use bitcoin::hashes::Hash;

    use std::str::FromStr;

    use bitcoin::secp256k1::PublicKey;

    const SAMPLE_PK: &str = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

    fn sample_signer_pk() -> XOnlyPublicKey {
        PublicKey::from_str(SAMPLE_PK)
            .expect("valid key")
            .x_only_public_key()
            .0
    }

    fn sample_vtxo_ref(amount_sats: u64) -> MigrationVtxoRef {
        MigrationVtxoRef {
            outpoint: OutPoint::new(Txid::from_byte_array([1; 32]), 0),
            amount: Amount::from_sat(amount_sats),
            signer_pk: sample_signer_pk(),
            cutoff_date: 9_999_999_999,
        }
    }

    fn sample_report(
        status: DeprecatedSignerStatus,
        vtxo_count: usize,
        vtxo_sats: u64,
        boarding_count: usize,
        boarding_sats: u64,
    ) -> DeprecatedSignerReport {
        DeprecatedSignerReport {
            signer_pk: sample_signer_pk(),
            status,
            cutoff_date: 9_999_999_999,
            seconds_until_cutoff: Some(86_400),
            vtxo_count,
            vtxo_value: Amount::from_sat(vtxo_sats),
            boarding_count,
            boarding_value: Amount::from_sat(boarding_sats),
            recoverable_count: 0,
            recoverable_value: Amount::ZERO,
            awaiting_sweep_count: 0,
            awaiting_sweep_value: Amount::ZERO,
            next_sweep_eta: None,
        }
    }

    #[test]
    fn pre_cutoff_cooperative_remaining_migratable_counts() {
        let reports = vec![
            sample_report(DeprecatedSignerStatus::Migratable, 2, 50_000, 1, 10_000),
            sample_report(DeprecatedSignerStatus::DueNow, 1, 25_000, 0, 0),
        ];
        let remaining = pre_cutoff_cooperative_remaining(&reports);
        assert_eq!(remaining.vtxo_count, 3);
        assert_eq!(remaining.vtxo_sats, 75_000);
        assert_eq!(remaining.boarding_count, 1);
        assert_eq!(remaining.boarding_sats, 10_000);
        assert!(remaining.has_remaining());
    }

    #[test]
    fn pre_cutoff_cooperative_remaining_ignores_expired() {
        let reports = vec![
            sample_report(DeprecatedSignerStatus::Expired, 5, 100_000, 2, 20_000),
            sample_report(DeprecatedSignerStatus::Migratable, 1, 5_000, 0, 0),
        ];
        let remaining = pre_cutoff_cooperative_remaining(&reports);
        assert_eq!(remaining.vtxo_count, 1);
        assert_eq!(remaining.vtxo_sats, 5_000);
        assert_eq!(remaining.boarding_count, 0);
    }

    #[test]
    fn aggregate_leg_report_sums_migrated_deferred_oversized() {
        let leg = MigrationLegReport {
            settle_txid: Some(Txid::from_byte_array([9; 32])),
            migrated: vec![sample_vtxo_ref(30_000), sample_vtxo_ref(20_000)],
            deferred: vec![sample_vtxo_ref(5_000)],
            oversized: vec![sample_vtxo_ref(1_000_000)],
            skipped: None,
            error: None,
        };
        let accum = aggregate_leg_report(&leg);
        assert_eq!(accum.migrated_count, 2);
        assert_eq!(accum.migrated_sats, 50_000);
        assert_eq!(accum.deferred_count, 1);
        assert_eq!(accum.deferred_sats, 5_000);
        assert_eq!(accum.oversized_count, 1);
        assert_eq!(accum.oversized_sats, 1_000_000);
        assert!(accum.last_settle_txid.is_some());
    }

    #[test]
    fn merge_leg_accum_adds_counts() {
        let mut total = SignerMigrationLegAccum {
            migrated_count: 1,
            migrated_sats: 10_000,
            ..Default::default()
        };
        let pass = SignerMigrationLegAccum {
            migrated_count: 2,
            migrated_sats: 20_000,
            deferred_count: 1,
            deferred_sats: 3_000,
            ..Default::default()
        };
        merge_leg_accum(&mut total, &pass);
        assert_eq!(total.migrated_count, 3);
        assert_eq!(total.migrated_sats, 30_000);
        assert_eq!(total.deferred_count, 1);
        assert_eq!(total.deferred_sats, 3_000);
    }

    #[test]
    fn build_signer_migration_result_dto_sets_pass_cap_reached() {
        let remaining = PreCutoffCooperativeRemaining {
            vtxo_count: 5,
            vtxo_sats: 10_000,
            boarding_count: 0,
            boarding_sats: 0,
        };
        let at_cap = build_signer_migration_result_dto(
            SignerMigrationLegAccum::default(),
            SignerMigrationLegAccum::default(),
            MAX_SIGNER_MIGRATION_PASSES,
            remaining,
            Vec::new(),
            false,
        );
        assert!(at_cap.pass_cap_reached);

        let below_cap = build_signer_migration_result_dto(
            SignerMigrationLegAccum::default(),
            SignerMigrationLegAccum::default(),
            MAX_SIGNER_MIGRATION_PASSES - 1,
            remaining,
            Vec::new(),
            false,
        );
        assert!(!below_cap.pass_cap_reached);

        let complete_at_cap = build_signer_migration_result_dto(
            SignerMigrationLegAccum::default(),
            SignerMigrationLegAccum::default(),
            MAX_SIGNER_MIGRATION_PASSES,
            PreCutoffCooperativeRemaining::default(),
            Vec::new(),
            true,
        );
        assert!(!complete_at_cap.pass_cap_reached);
    }
}
