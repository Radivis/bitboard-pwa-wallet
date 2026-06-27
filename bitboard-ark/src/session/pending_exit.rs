use std::collections::HashSet;

use crate::error::{ArkResult, ArkWasmError};
use crate::exit_balance::{
    sum_pending_exit_sats_by_kind, unilateral_exit_in_progress_sats_from_snapshot,
};
use crate::persistence::{PendingExitDeductionRecord, PendingExitKind};

use super::ArkSession;
use super::mappers::{current_unix_timestamp, parse_outpoint};

impl ArkSession {
    pub(crate) fn exit_balance_components(&self) -> ArkResult<(u64, u64)> {
        let pending = self.wallet_db.pending_exit_deductions();
        let snapshot_unilateral_sats = self
            .wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .as_ref()
            .map(unilateral_exit_in_progress_sats_from_snapshot)
            .transpose()?
            .unwrap_or(0);
        let pending_unilateral_sats =
            sum_pending_exit_sats_by_kind(&pending, PendingExitKind::Unilateral);
        let unilateral_exit_in_progress_sats =
            snapshot_unilateral_sats.saturating_add(pending_unilateral_sats);
        let collaborative_exit_in_progress_sats =
            sum_pending_exit_sats_by_kind(&pending, PendingExitKind::Collaborative);
        Ok((
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
        ))
    }

    pub(crate) async fn vtxo_amount_sats_for_outpoint(
        &self,
        txid: &str,
        vout: u32,
    ) -> ArkResult<u64> {
        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref() {
            for record in &snapshot.virtual_tx_outpoints {
                if record.txid == txid && record.vout == vout {
                    return Ok(record.amount_sats);
                }
            }
        }

        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let target_txid = parse_outpoint(txid, vout)?.txid;
        let amount = vtxo_list
            .all()
            .find(|virtual_tx_outpoint| {
                virtual_tx_outpoint.outpoint.txid == target_txid
                    && virtual_tx_outpoint.outpoint.vout == vout
            })
            .map(|virtual_tx_outpoint| virtual_tx_outpoint.amount.to_sat())
            .ok_or(ArkWasmError::VtxoNotFound {
                txid: txid.to_string(),
                vout,
            })?;
        Ok(amount)
    }

    pub(crate) fn record_pending_unilateral_exit(&self, txid: &str, vout: u32, amount_sats: u64) {
        self.wallet_db
            .upsert_pending_exit_deduction(PendingExitDeductionRecord {
                kind: PendingExitKind::Unilateral,
                vtxo_txid: Some(txid.to_string()),
                vout: Some(vout),
                amount_sats,
                started_at: current_unix_timestamp(),
                baseline_offchain_spendable_sats: None,
            });
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
            });
    }

    pub(crate) fn clear_pending_unilateral_exits_for_txids(&self, vtxo_txids: &[bitcoin::Txid]) {
        let txid_set: HashSet<String> = vtxo_txids.iter().map(|txid| txid.to_string()).collect();
        let mut pending = self.wallet_db.pending_exit_deductions();
        pending.retain(|record| {
            if record.kind != PendingExitKind::Unilateral {
                return true;
            }
            record
                .vtxo_txid
                .as_ref()
                .is_none_or(|txid| !txid_set.contains(txid))
        });
        self.wallet_db.set_pending_exit_deductions(pending);
    }
}
