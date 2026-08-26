use bitcoin::Transaction;

use crate::api_types::{
    ProceedUnilateralExitStepParams, ProceedUnilateralExitStepResultDto, UnilateralExitPhase,
};
use crate::constants::MIN_FEE_RATE_SAT_PER_VB;
use crate::error::{ArkResult, ArkWasmError};
use crate::esplora_blockchain::{
    is_package_not_child_with_unconfirmed_parents_error,
    is_redundant_unilateral_exit_broadcast_error,
};

use super::plan::UnilateralBatchPlan;
use super::progress::{step_reached_confirmation, tx_confirmations};
use super::snapshot_ops::dedup_virtual_outpoints;
use crate::session::ArkSession;
use crate::session::open::sync_onchain_wallet_with_retries;

fn empty_witness_input_summaries(parent: &Transaction) -> Vec<String> {
    parent
        .input
        .iter()
        .enumerate()
        .filter(|(_, input)| input.witness.is_empty())
        .map(|(index, input)| {
            format!(
                "input {index} spending {}:{}",
                input.previous_output.txid, input.previous_output.vout
            )
        })
        .collect()
}

/// `/raw` is the primary relay signal; regtest Esplora often keeps mempool parents at `/raw` 404
/// until mined. After `proceed_unilateral_exit_step` stamps a wait record, treat broadcast as done.
pub(crate) fn unilateral_exit_step_broadcast_satisfied(
    raw_relayed: bool,
    step_txid: &bitcoin::Txid,
    step_wait: Option<&crate::persistence::UnilateralExitStepWaitRecord>,
) -> bool {
    raw_relayed || step_wait.is_some_and(|record| record.step_txid == step_txid.to_string())
}

impl ArkSession {
    pub async fn proceed_unilateral_exit_step(
        &self,
        params: ProceedUnilateralExitStepParams,
    ) -> ArkResult<ProceedUnilateralExitStepResultDto> {
        if params.vtxo_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }
        let fee_rate_sat_per_vb = params.fee_rate_sat_per_vb.max(MIN_FEE_RATE_SAT_PER_VB);

        let virtual_outpoints = dedup_virtual_outpoints(params.vtxo_outpoints);
        for outpoint in &virtual_outpoints {
            let vtxo_txid = outpoint.txid.to_string();
            if !self.virtual_tx_is_marked_unrolled(&vtxo_txid)? {
                let amount_sats = self
                    .vtxo_amount_sats_for_outpoint(&vtxo_txid, outpoint.vout)
                    .await?;
                self.record_pending_unilateral_exit(&vtxo_txid, outpoint.vout, amount_sats);
            }
        }

        let plan = self.build_unilateral_batch_plan(&virtual_outpoints).await?;
        let blockchain = self.client.blockchain();
        blockchain.prepare_confirmation_scan().await;

        let current_step_index = self
            .first_incomplete_step_index(blockchain, &plan.ordered_step_txids)
            .await?;

        if current_step_index >= plan.ordered_step_txids.len() {
            self.wallet_db.clear_unilateral_exit_step_wait();
            self.mark_unrolled_leaves_at_finality(&plan).await?;
            return self
                .build_proceed_result(
                    &plan,
                    None,
                    current_step_index,
                    UnilateralExitPhase::Complete,
                )
                .await;
        }

        let step_txid = plan.ordered_step_txids[current_step_index];
        let parent_tx = plan
            .tx_by_id
            .get(&step_txid)
            .ok_or_else(|| ArkWasmError::Snapshot(format!("missing branch tx for {step_txid}")))?
            .clone();

        let empty_witness_inputs = empty_witness_input_summaries(&parent_tx);
        if !empty_witness_inputs.is_empty() {
            return Err(ArkWasmError::Client(ark_client::Error::wallet(format!(
                "refusing to broadcast unsigned unilateral-exit inputs: {}",
                empty_witness_inputs.join("; ")
            ))));
        }

        let confirmations_before = tx_confirmations(blockchain, &step_txid).await?;
        let phase = UnilateralExitPhase::Waiting;
        let already_submitted_this_step = self
            .wallet_db
            .unilateral_exit_step_wait()
            .is_some_and(|record| record.step_txid == step_txid.to_string());

        if !already_submitted_this_step {
            sync_onchain_wallet_with_retries(&self.client).await?;
            if let Err(error) = self
                .client
                .broadcast_unilateral_exit_step_at_fee_rate(&parent_tx, fee_rate_sat_per_vb)
                .await
            {
                if is_package_not_child_with_unconfirmed_parents_error(&error) {
                    // submitpackage rejected this child because a parent is still unconfirmed on
                    // the submit node. Do not treat as success even if Esplora `/raw` already sees it.
                    return Err(ArkWasmError::Client(error));
                }
                let broadcast_satisfied_after_error = unilateral_exit_step_broadcast_satisfied(
                    blockchain.is_tx_relayed_on_network(&step_txid).await?,
                    &step_txid,
                    self.wallet_db.unilateral_exit_step_wait().as_ref(),
                );
                if !is_redundant_unilateral_exit_broadcast_error(&error)
                    && !broadcast_satisfied_after_error
                {
                    return Err(ArkWasmError::Client(error));
                }
            }

            self.wallet_db.ensure_unilateral_exit_step_wait(
                &step_txid.to_string(),
                current_step_index as u32,
            );
        } else if step_reached_confirmation(confirmations_before) {
            self.wallet_db.clear_unilateral_exit_step_wait();
        }

        self.mark_unrolled_leaves_at_finality(&plan).await?;

        self.build_proceed_result(
            &plan,
            Some(step_txid.to_string()),
            current_step_index,
            phase,
        )
        .await
    }

    async fn build_proceed_result(
        &self,
        plan: &UnilateralBatchPlan,
        step_txid: Option<String>,
        step_index: usize,
        phase: UnilateralExitPhase,
    ) -> ArkResult<ProceedUnilateralExitStepResultDto> {
        let blockchain = self.client.blockchain();
        let current_step_index = self
            .first_incomplete_step_index(blockchain, &plan.ordered_step_txids)
            .await?;
        let current_step_waiting_since = self
            .current_step_waiting_since(blockchain, plan, current_step_index)
            .await?;
        let current_step_tx_relayed = self
            .current_step_tx_relayed(blockchain, plan, current_step_index)
            .await?;
        let resolved_phase = if current_step_index >= plan.ordered_step_txids.len() {
            UnilateralExitPhase::Complete
        } else if current_step_waiting_since.is_some() {
            UnilateralExitPhase::Waiting
        } else {
            phase
        };
        Ok(ProceedUnilateralExitStepResultDto {
            step_txid,
            step_index: step_index as u32,
            total_steps: plan.ordered_step_txids.len().max(1) as u32,
            phase: resolved_phase,
            current_step_waiting_since,
            current_step_tx_relayed,
            node_statuses: self
                .node_statuses_for_plan(blockchain, plan, current_step_index)
                .await?,
            leaf_statuses: self.leaf_statuses_for_plan(blockchain, plan).await?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bitcoin::Transaction;
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;

    fn txid(byte: u8) -> Txid {
        Txid::from_byte_array([byte; 32])
    }

    #[test]
    fn step_broadcast_satisfied_when_wait_record_matches_step_txid() {
        use crate::persistence::UnilateralExitStepWaitRecord;

        let step_txid = txid(42);
        let wait = UnilateralExitStepWaitRecord {
            step_txid: step_txid.to_string(),
            step_index: 0,
            started_at: 1_700_000_000,
        };
        assert!(unilateral_exit_step_broadcast_satisfied(
            false,
            &step_txid,
            Some(&wait),
        ));
        assert!(!unilateral_exit_step_broadcast_satisfied(
            false,
            &txid(43),
            Some(&wait),
        ));
        assert!(unilateral_exit_step_broadcast_satisfied(
            true, &step_txid, None
        ));
    }

    #[test]
    fn empty_witness_input_summaries_lists_unsigned_inputs() {
        let tx = Transaction {
            version: bitcoin::transaction::Version::TWO,
            lock_time: bitcoin::absolute::LockTime::ZERO,
            input: vec![bitcoin::TxIn {
                previous_output: bitcoin::OutPoint {
                    txid: txid(9),
                    vout: 0,
                },
                script_sig: bitcoin::ScriptBuf::new(),
                sequence: bitcoin::Sequence::MAX,
                witness: bitcoin::Witness::new(),
            }],
            output: vec![],
        };
        let summaries = empty_witness_input_summaries(&tx);
        assert_eq!(summaries.len(), 1);
        assert!(summaries[0].contains("input 0"));
        assert!(summaries[0].contains(&txid(9).to_string()));
    }
}
