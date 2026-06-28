use std::str::FromStr;

use bitcoin::Amount;
use bitcoin::Txid;

use crate::error::ArkWasmError;
use crate::offchain_snapshot::vtxo_list_from_snapshot;
use crate::persistence::{OffchainVtxoSnapshot, PendingExitDeductionRecord, PendingExitKind};

pub fn unilateral_exit_in_progress_sats_from_snapshot(
    snapshot: &OffchainVtxoSnapshot,
) -> crate::error::ArkResult<u64> {
    let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
    Ok(vtxo_list
        .spent()
        .filter(|vtp| vtp.is_unrolled && !vtp.is_spent)
        .fold(Amount::ZERO, |acc, vtp| acc + vtp.amount)
        .to_sat())
}

pub fn sum_pending_exit_sats_by_kind(
    records: &[PendingExitDeductionRecord],
    kind: PendingExitKind,
) -> u64 {
    records
        .iter()
        .filter(|record| record.kind == kind)
        .fold(0u64, |acc, record| acc.saturating_add(record.amount_sats))
}

pub fn vtxo_still_spendable_in_snapshot(
    snapshot: &OffchainVtxoSnapshot,
    txid: &str,
    vout: u32,
) -> crate::error::ArkResult<bool> {
    let target_txid =
        Txid::from_str(txid).map_err(|error| ArkWasmError::InvalidTxid(error.to_string()))?;
    let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
    Ok(vtxo_list.all_unspent().any(|vtp| {
        vtp.outpoint.txid == target_txid
            && vtp.outpoint.vout == vout
            && !vtp.is_unrolled
            && !vtp.is_spent
    }))
}

fn is_invalid_pending_vtxo_txid_error(error: &ArkWasmError) -> bool {
    matches!(error, ArkWasmError::InvalidTxid(_))
}

pub fn should_keep_pending_exit_deduction(
    record: &PendingExitDeductionRecord,
    snapshot: &OffchainVtxoSnapshot,
    gross_offchain_spendable_sats: u64,
) -> crate::error::ArkResult<bool> {
    match record.kind {
        PendingExitKind::Unilateral => {
            let Some(txid) = record.vtxo_txid.as_deref() else {
                return Ok(false);
            };
            let vout = record.vout.unwrap_or(0);
            match vtxo_still_spendable_in_snapshot(snapshot, txid, vout) {
                Ok(keep) => Ok(keep),
                Err(error) if is_invalid_pending_vtxo_txid_error(&error) => Ok(false),
                Err(error) => Err(error),
            }
        }
        PendingExitKind::Collaborative => {
            let Some(baseline) = record.baseline_offchain_spendable_sats else {
                return Ok(false);
            };
            Ok(gross_offchain_spendable_sats > baseline.saturating_sub(record.amount_sats))
        }
    }
}

pub fn reconcile_pending_exit_deductions(
    records: &mut Vec<PendingExitDeductionRecord>,
    snapshot: &OffchainVtxoSnapshot,
    gross_offchain_spendable_sats: u64,
) -> crate::error::ArkResult<()> {
    let mut retained = Vec::with_capacity(records.len());
    for record in records.drain(..) {
        if should_keep_pending_exit_deduction(&record, snapshot, gross_offchain_spendable_sats)? {
            retained.push(record);
        }
    }
    *records = retained;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::VirtualTxOutPointRecord;
    use bitcoin::hashes::Hash;

    fn sample_vtp_record(
        txid_byte: u8,
        vout: u32,
        amount_sats: u64,
        is_unrolled: bool,
        is_spent: bool,
    ) -> VirtualTxOutPointRecord {
        VirtualTxOutPointRecord {
            txid: Txid::from_byte_array([txid_byte; 32]).to_string(),
            vout,
            created_at: 1_700_000_000,
            expires_at: 1_800_000_000,
            amount_sats,
            script_hex: String::new(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled,
            is_spent,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
            server_pk_hex: None,
        }
    }

    fn snapshot_with(records: Vec<VirtualTxOutPointRecord>) -> OffchainVtxoSnapshot {
        OffchainVtxoSnapshot {
            synced_at: 1_700_000_000,
            dust_sats: 330,
            virtual_tx_outpoints: records,
        }
    }

    #[test]
    fn unilateral_exit_in_progress_sats_from_snapshot_counts_unrolled_unspent() {
        let snapshot = snapshot_with(vec![
            sample_vtp_record(1, 0, 180_603, true, false),
            sample_vtp_record(2, 0, 50_000, false, false),
        ]);

        assert_eq!(
            unilateral_exit_in_progress_sats_from_snapshot(&snapshot).expect("sum"),
            180_603
        );
    }

    #[test]
    fn reconcile_pending_clears_unilateral_when_vtxo_unrolled_in_snapshot() {
        let txid = Txid::from_byte_array([9; 32]).to_string();
        let snapshot = snapshot_with(vec![VirtualTxOutPointRecord {
            txid: txid.clone(),
            vout: 0,
            created_at: 1_700_000_000,
            expires_at: 1_800_000_000,
            amount_sats: 180_603,
            script_hex: String::new(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: true,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
            server_pk_hex: None,
        }]);

        let mut records = vec![PendingExitDeductionRecord {
            kind: PendingExitKind::Unilateral,
            vtxo_txid: Some(txid),
            vout: Some(0),
            amount_sats: 180_603,
            started_at: 1_700_000_000,
            baseline_offchain_spendable_sats: None,
        }];

        reconcile_pending_exit_deductions(&mut records, &snapshot, 0).expect("reconcile");
        assert!(records.is_empty());
    }

    #[test]
    fn pending_collaborative_cleared_when_spendable_dropped() {
        let snapshot = snapshot_with(vec![sample_vtp_record(2, 0, 30_000, false, false)]);

        let mut records = vec![PendingExitDeductionRecord {
            kind: PendingExitKind::Collaborative,
            vtxo_txid: None,
            vout: None,
            amount_sats: 100_000,
            started_at: 1_700_000_000,
            baseline_offchain_spendable_sats: Some(130_000),
        }];

        reconcile_pending_exit_deductions(&mut records, &snapshot, 30_000).expect("reconcile");
        assert!(records.is_empty());
    }

    #[test]
    fn sum_pending_exit_sats_by_kind_filters_records() {
        let records = vec![
            PendingExitDeductionRecord {
                kind: PendingExitKind::Unilateral,
                vtxo_txid: Some("aa".repeat(32)),
                vout: Some(0),
                amount_sats: 50_000,
                started_at: 1,
                baseline_offchain_spendable_sats: None,
            },
            PendingExitDeductionRecord {
                kind: PendingExitKind::Collaborative,
                vtxo_txid: None,
                vout: None,
                amount_sats: 100_000,
                started_at: 2,
                baseline_offchain_spendable_sats: Some(200_000),
            },
            PendingExitDeductionRecord {
                kind: PendingExitKind::Unilateral,
                vtxo_txid: Some("bb".repeat(32)),
                vout: Some(1),
                amount_sats: 25_000,
                started_at: 3,
                baseline_offchain_spendable_sats: None,
            },
        ];

        assert_eq!(
            sum_pending_exit_sats_by_kind(&records, PendingExitKind::Unilateral),
            75_000
        );
        assert_eq!(
            sum_pending_exit_sats_by_kind(&records, PendingExitKind::Collaborative),
            100_000
        );
    }

    #[test]
    fn reconcile_drops_unilateral_with_invalid_txid_without_failing() {
        let snapshot = snapshot_with(vec![sample_vtp_record(2, 0, 30_000, false, false)]);

        let mut records = vec![PendingExitDeductionRecord {
            kind: PendingExitKind::Unilateral,
            vtxo_txid: Some("not-a-txid".to_string()),
            vout: Some(0),
            amount_sats: 50_000,
            started_at: 1_700_000_000,
            baseline_offchain_spendable_sats: None,
        }];

        reconcile_pending_exit_deductions(&mut records, &snapshot, 0).expect("reconcile");
        assert!(records.is_empty());
    }
}
