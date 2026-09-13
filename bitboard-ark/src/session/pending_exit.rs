use std::collections::HashSet;
use std::str::FromStr;

use crate::error::{ArkResult, ArkWasmError};
use crate::persistence::{JsonPersistenceDb, PendingExitDeductionRecord, PendingExitKind};

use super::ArkSession;
use super::mappers::current_unix_timestamp;

pub(crate) fn mark_vtxo_spent_in_snapshot(
    snapshot: &mut crate::persistence::OffchainVtxoSnapshot,
    txid: &str,
    vout: u32,
    spent_by: &str,
) {
    for record in &mut snapshot.virtual_tx_outpoints {
        if record.txid == txid && record.vout == vout {
            record.is_spent = true;
            record.spent_by = Some(spent_by.to_string());
        }
    }
}

pub(crate) fn mark_vtxo_spent_in_wallet_db(
    wallet_db: &JsonPersistenceDb,
    txid: &str,
    vout: u32,
    spent_by: &str,
) {
    let Some(mut snapshot) = wallet_db.snapshot().offchain_vtxo_snapshot.clone() else {
        return;
    };
    mark_vtxo_spent_in_snapshot(&mut snapshot, txid, vout, spent_by);
    wallet_db.set_offchain_vtxo_snapshot(snapshot);
}

impl ArkSession {
    /// Stable exit-pipeline totals for the balance DTO.
    ///
    /// Unilateral: sums VTXO exit records in `tagged`…`complete_ready`. Spend-lock of tagged
    /// amounts still in gross spendable is applied in [`build_arkade_balance_dto`].
    /// Collaborative: open CollaborativeExit pending-intent amounts, plus a retain deduction
    /// after join Completed until snapshot spendable drops. Cancel must not leave that line.
    pub(crate) fn exit_balance_components(&self) -> ArkResult<(u64, u64, u64)> {
        let pending = self.wallet_db.pending_exit_deductions();
        let records = self.wallet_db.vtxo_exit_records();
        let snapshot = self.wallet_db.snapshot();
        let unilateral_exit_in_progress_sats =
            crate::session::unilateral_exit::vtxo_exit::unilateral_exit_in_progress_sats_from_records(
                &records,
            );
        let unilateral_exit_spend_lock_sats =
            crate::session::unilateral_exit::vtxo_exit::unilateral_exit_spend_lock_sats(
                &records,
                snapshot.offchain_vtxo_snapshot.as_ref(),
            );
        let collaborative_exit_in_progress_sats =
            crate::exit_balance::collaborative_exit_in_progress_sats(
                &self.wallet_db.pending_batch_intents(),
                &pending,
            );
        Ok((
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
            unilateral_exit_spend_lock_sats,
        ))
    }

    pub(crate) async fn vtxo_amount_sats_for_outpoint(
        &self,
        txid: &str,
        vout: u32,
    ) -> ArkResult<u64> {
        if let Some(amount_sats) = crate::unilateral_exit_materials::vtxo_amount_sats_from_snapshot(
            self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref(),
            txid,
            vout,
        ) {
            return Ok(amount_sats);
        }

        Err(ArkWasmError::VtxoNotFound {
            txid: txid.to_string(),
            vout,
        })
    }

    pub(crate) fn record_pending_collaborative_exit(&self, amount_sats: u64, baseline_sats: u64) {
        self.wallet_db
            .upsert_pending_exit_deduction(PendingExitDeductionRecord {
                kind: PendingExitKind::Collaborative,
                vtxo_txid: None,
                vout: None,
                amount_sats,
                started_at: current_unix_timestamp(),
                baseline_offchain_spendable_sats: Some(baseline_sats),
                retain_until_spendable_drops: true,
            });
    }

    pub(crate) fn clear_pending_collaborative_exit_deduction(&self) {
        let mut pending = self.wallet_db.pending_exit_deductions();
        pending.retain(|record| record.kind != PendingExitKind::Collaborative);
        self.wallet_db.set_pending_exit_deductions(pending);
    }

    pub(crate) fn clear_pending_unilateral_exits_for_outpoints(
        &self,
        outpoints: &[bitcoin::OutPoint],
    ) {
        let outpoint_set: HashSet<bitcoin::OutPoint> = outpoints.iter().copied().collect();
        let mut pending = self.wallet_db.pending_exit_deductions();
        pending.retain(|record| {
            if record.kind != PendingExitKind::Unilateral {
                return true;
            }
            let Some(txid) = record.vtxo_txid.as_deref() else {
                return true;
            };
            let vout = record.vout.unwrap_or(0);
            let Ok(parsed_txid) = bitcoin::Txid::from_str(txid) else {
                return true;
            };
            let record_outpoint = bitcoin::OutPoint {
                txid: parsed_txid,
                vout,
            };
            !outpoint_set.contains(&record_outpoint)
        });
        self.wallet_db.set_pending_exit_deductions(pending);
    }

    /// Local snapshot + pending cleanup after a successful on-chain completion broadcast.
    pub(crate) fn finalize_unilateral_exit_completion_local_state(
        &self,
        vtxo_outpoints: &[bitcoin::OutPoint],
        completion_txid: &str,
    ) {
        for outpoint in vtxo_outpoints {
            mark_vtxo_spent_in_wallet_db(
                &self.wallet_db,
                &outpoint.txid.to_string(),
                outpoint.vout,
                completion_txid,
            );
        }
        self.clear_pending_unilateral_exits_for_outpoints(vtxo_outpoints);
        let mut records = self.wallet_db.vtxo_exit_records();
        crate::session::unilateral_exit::vtxo_exit::mark_records_exited_for_outpoints(
            &mut records,
            vtxo_outpoints,
        );
        self.wallet_db.set_vtxo_exit_records(records);
    }
}
