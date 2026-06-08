use std::str::FromStr;

use bitcoin::Amount;
use bitcoin::Txid;

use crate::offchain_snapshot::{offchain_balance_sats_from_snapshot, vtxo_list_from_snapshot};
use crate::persistence::{OffchainVtxoSnapshot, PendingExitDeductionRecord};

pub const PENDING_EXIT_KIND_UNILATERAL: &str = "unilateral";
pub const PENDING_EXIT_KIND_COLLABORATIVE: &str = "collaborative";

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

pub fn sum_pending_exit_sats_by_kind(records: &[PendingExitDeductionRecord], kind: &str) -> u64 {
    records
        .iter()
        .filter(|record| record.kind == kind)
        .fold(0u64, |acc, record| acc.saturating_add(record.amount_sats))
}

pub fn gross_offchain_spendable_sats_from_snapshot(
    snapshot: &OffchainVtxoSnapshot,
) -> crate::error::ArkResult<u64> {
    let (pre_confirmed, confirmed, _) = offchain_balance_sats_from_snapshot(snapshot)?;
    Ok(pre_confirmed.saturating_add(confirmed))
}

pub fn vtxo_still_spendable_in_snapshot(
    snapshot: &OffchainVtxoSnapshot,
    txid: &str,
    vout: u32,
) -> crate::error::ArkResult<bool> {
    let target_txid = Txid::from_str(txid)
        .map_err(|error| crate::error::ArkWasmError::Message(format!("invalid txid: {error}")))?;
    let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
    Ok(vtxo_list.all_unspent().any(|vtp| {
        vtp.outpoint.txid == target_txid
            && vtp.outpoint.vout == vout
            && !vtp.is_unrolled
            && !vtp.is_spent
    }))
}

pub fn should_keep_pending_exit_deduction(
    record: &PendingExitDeductionRecord,
    snapshot: &OffchainVtxoSnapshot,
    gross_offchain_spendable_sats: u64,
) -> crate::error::ArkResult<bool> {
    match record.kind.as_str() {
        PENDING_EXIT_KIND_UNILATERAL => {
            let Some(txid) = record.vtxo_txid.as_deref() else {
                return Ok(false);
            };
            let vout = record.vout.unwrap_or(0);
            vtxo_still_spendable_in_snapshot(snapshot, txid, vout)
        }
        PENDING_EXIT_KIND_COLLABORATIVE => {
            let Some(baseline) = record.baseline_offchain_spendable_sats else {
                return Ok(false);
            };
            Ok(gross_offchain_spendable_sats > baseline.saturating_sub(record.amount_sats))
        }
        _ => Ok(false),
    }
}

pub fn reconcile_pending_exit_deductions(
    records: &mut Vec<PendingExitDeductionRecord>,
    snapshot: &OffchainVtxoSnapshot,
) -> crate::error::ArkResult<()> {
    let gross_offchain_spendable_sats = gross_offchain_spendable_sats_from_snapshot(snapshot)?;
    records.retain(|record| {
        should_keep_pending_exit_deduction(record, snapshot, gross_offchain_spendable_sats)
            .unwrap_or(false)
    });
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
        }]);

        let mut records = vec![PendingExitDeductionRecord {
            kind: PENDING_EXIT_KIND_UNILATERAL.to_string(),
            vtxo_txid: Some(txid),
            vout: Some(0),
            amount_sats: 180_603,
            started_at: 1_700_000_000,
            baseline_offchain_spendable_sats: None,
        }];

        reconcile_pending_exit_deductions(&mut records, &snapshot).expect("reconcile");
        assert!(records.is_empty());
    }

    #[test]
    fn pending_collaborative_cleared_when_spendable_dropped() {
        let snapshot = snapshot_with(vec![sample_vtp_record(2, 0, 30_000, false, false)]);

        let mut records = vec![PendingExitDeductionRecord {
            kind: PENDING_EXIT_KIND_COLLABORATIVE.to_string(),
            vtxo_txid: None,
            vout: None,
            amount_sats: 100_000,
            started_at: 1_700_000_000,
            baseline_offchain_spendable_sats: Some(130_000),
        }];

        reconcile_pending_exit_deductions(&mut records, &snapshot).expect("reconcile");
        assert!(records.is_empty());
    }
}
