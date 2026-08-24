use std::collections::{HashMap, HashSet};

use bitcoin::{Transaction, Txid};

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
/// Submit-node override when Esplora painted a parent confirmed but `submitpackage` disagreed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum UnspendableParentState {
    NeedsBroadcast { marked_at_tip: Option<u32> },
    Broadcasted { broadcast_at_tip: Option<u32> },
}

pub(crate) fn unroll_parent_txids_in_plan(
    transaction: &Transaction,
    ordered_step_txids: &[Txid],
) -> Vec<Txid> {
    transaction
        .input
        .iter()
        .map(|input| input.previous_output.txid)
        .filter(|txid| ordered_step_txids.contains(txid))
        .collect()
}

/// Plan ancestors of `transaction`, oldest (lowest plan index) first.
/// Immediate parents are not enough for `package-not-child`: the submit node may
/// also be missing grandparents, and wrapping only the parent in a new CPFP still fails.
pub(crate) fn unroll_ancestor_txids_oldest_first(
    transaction: &Transaction,
    ordered_step_txids: &[Txid],
    tx_by_id: &HashMap<Txid, Transaction>,
) -> Vec<Txid> {
    let mut seen = HashSet::new();
    let mut stack = unroll_parent_txids_in_plan(transaction, ordered_step_txids);
    while let Some(txid) = stack.pop() {
        if !seen.insert(txid) {
            continue;
        }
        if let Some(ancestor_tx) = tx_by_id.get(&txid) {
            stack.extend(unroll_parent_txids_in_plan(ancestor_tx, ordered_step_txids));
        }
    }
    let mut ancestors: Vec<Txid> = seen.into_iter().collect();
    ancestors.sort_by_key(|txid| {
        ordered_step_txids
            .iter()
            .position(|step| step == txid)
            .unwrap_or(usize::MAX)
    });
    ancestors
}

/// Parents this wallet already submitted (`index <= wait_index`) must not be marked
/// unspendable. Without a wait stamp, any plan parent is eligible (cold-start skip).
pub(crate) fn unroll_parent_already_submitted(
    parent_index: usize,
    wait_index: Option<usize>,
) -> bool {
    wait_index.is_some_and(|wait| parent_index <= wait)
}

pub(crate) fn unroll_parent_txids_skipped_after_wait(
    parent_txids: &[Txid],
    ordered_step_txids: &[Txid],
    wait_index: Option<usize>,
) -> Vec<Txid> {
    parent_txids
        .iter()
        .copied()
        .filter(|txid| {
            ordered_step_txids
                .iter()
                .position(|step| step == txid)
                .is_some_and(|index| !unroll_parent_already_submitted(index, wait_index))
        })
        .collect()
}

pub(crate) fn unroll_parent_txs_from_plan(
    parent_txids: &[Txid],
    tx_by_id: &HashMap<Txid, Transaction>,
) -> Vec<Transaction> {
    parent_txids
        .iter()
        .filter_map(|txid| tx_by_id.get(txid).cloned())
        .collect()
}

pub(crate) fn unspendable_parent_blocks_step(
    state: Option<&UnspendableParentState>,
    current_tip: Option<u32>,
) -> bool {
    match state {
        None => false,
        Some(UnspendableParentState::NeedsBroadcast { .. }) => true,
        Some(UnspendableParentState::Broadcasted { broadcast_at_tip }) => current_tip
            .zip(*broadcast_at_tip)
            .is_none_or(|(tip, broadcast_tip)| tip <= broadcast_tip),
    }
}

#[cfg(test)]
pub(crate) fn should_force_unilateral_exit_step_broadcast(
    esplora_confirmations: u64,
    marked_unspendable: bool,
) -> bool {
    marked_unspendable || !step_reached_confirmation(esplora_confirmations)
}
pub(crate) fn should_sync_bumper_wallet_before_unroll_broadcast(
    force_unspendable: bool,
    already_submitted_this_step: bool,
) -> bool {
    force_unspendable || !already_submitted_this_step
}

/// `/raw` is the primary relay signal; regtest Esplora often keeps mempool parents at `/raw` 404
/// until mined. After `proceed_unilateral_exit_step` stamps a wait record, treat broadcast as done.
pub(crate) fn unilateral_exit_step_broadcast_satisfied(
    raw_relayed: bool,
    step_txid: &Txid,
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
            if !self.leaf_is_marked_unrolled(&vtxo_txid, outpoint.vout)? {
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
        let step_wait = self.wallet_db.unilateral_exit_step_wait();
        let wait_index = step_wait.as_ref().map(|record| record.step_index as usize);
        let force_unspendable = self.unroll_parent_blocks_unbroadcast_successor(
            &step_txid,
            current_step_index,
            wait_index,
        );
        let already_submitted_this_step = step_wait
            .as_ref()
            .is_some_and(|record| record.step_txid == step_txid.to_string());

        if should_sync_bumper_wallet_before_unroll_broadcast(
            force_unspendable,
            already_submitted_this_step,
        ) {
            sync_onchain_wallet_with_retries(&self.client).await?;
            if let Err(error) = self
                .client
                .broadcast_unilateral_exit_step_at_fee_rate(&parent_tx, fee_rate_sat_per_vb)
                .await
            {
                if is_package_not_child_with_unconfirmed_parents_error(&error) {
                    // Same-package H12 retry cannot help: BDK was just synced, and
                    // wait-covered ancestors have empty inject lists. Leave waitingForParentData
                    // to the hydrate/Proceed path (the same path a page reload uses).
                    return Err(ArkWasmError::Client(error));
                } else {
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
            }
            if force_unspendable {
                self.mark_unspendable_parent_broadcasted(
                    &step_txid,
                    blockchain.cached_tip_height(),
                );
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
    fn unroll_parent_blocks_step(&self, txid: &Txid) -> bool {
        let tip = self.client.blockchain().cached_tip_height();
        let mut parents = self
            .unspendable_unroll_parents
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let blocks = unspendable_parent_blocks_step(parents.get(txid), tip);
        if !blocks {
            parents.remove(txid);
        }
        blocks
    }

    fn release_unspendable_parent(&self, txid: &Txid) -> bool {
        let mut parents = self
            .unspendable_unroll_parents
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        parents.remove(txid).is_some()
    }

    /// Unspendable override only applies to steps this wallet has not already submitted.
    pub(super) fn unroll_parent_blocks_unbroadcast_successor(
        &self,
        txid: &Txid,
        index: usize,
        wait_index: Option<usize>,
    ) -> bool {
        if unroll_parent_already_submitted(index, wait_index) {
            let _ = self.release_unspendable_parent(txid);
            return false;
        }
        self.unroll_parent_blocks_step(txid)
    }

    #[allow(dead_code)]
    async fn retry_step_after_unconfirmed_package_parents(
        &self,
        parent_tx: &Transaction,
        plan: &UnilateralBatchPlan,
        fee_rate_sat_per_vb: f64,
        wait_index: Option<usize>,
        _current_step_index: usize,
    ) -> ArkResult<()> {
        let plan_parents = unroll_parent_txids_in_plan(parent_tx, &plan.ordered_step_txids);
        let ancestor_txids =
            unroll_ancestor_txids_oldest_first(parent_tx, &plan.ordered_step_txids, &plan.tx_by_id);
        // Do not wrap already-submitted ancestors in a new CPFP: their P2A is spent
        // and submitpackage treats them as already-in-mempool, which is itself
        // package-not-child. Only inject plan txs this wallet has not broadcast yet.
        let ancestors_to_inject = unroll_parent_txids_skipped_after_wait(
            &ancestor_txids,
            &plan.ordered_step_txids,
            wait_index,
        );
        let ancestors = unroll_parent_txs_from_plan(&ancestors_to_inject, &plan.tx_by_id);
        let skipped = unroll_parent_txids_skipped_after_wait(
            &plan_parents,
            &plan.ordered_step_txids,
            wait_index,
        );
        for ancestor in &ancestors {
            let _ = self
                .client
                .broadcast_unilateral_exit_step_at_fee_rate(ancestor, fee_rate_sat_per_vb)
                .await;
        }
        match self
            .client
            .broadcast_unilateral_exit_step_at_fee_rate(parent_tx, fee_rate_sat_per_vb)
            .await
        {
            Ok(_) => Ok(()),
            Err(retry_error) => {
                if !skipped.is_empty() {
                    self.mark_unspendable_unroll_parents(
                        &skipped,
                        self.client.blockchain().cached_tip_height(),
                    );
                }
                Err(ArkWasmError::Client(retry_error))
            }
        }
    }

    fn mark_unspendable_unroll_parents(&self, txids: &[Txid], tip: Option<u32>) {
        let mut parents = self
            .unspendable_unroll_parents
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        for txid in txids {
            parents
                .entry(*txid)
                .or_insert(UnspendableParentState::NeedsBroadcast { marked_at_tip: tip });
        }
    }

    fn mark_unspendable_parent_broadcasted(&self, txid: &Txid, tip: Option<u32>) {
        let mut parents = self
            .unspendable_unroll_parents
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        parents.insert(
            *txid,
            UnspendableParentState::Broadcasted {
                broadcast_at_tip: tip,
            },
        );
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
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;
    use std::collections::HashMap;

    fn txid(byte: u8) -> Txid {
        Txid::from_byte_array([byte; 32])
    }

    fn dummy_tx_spending(parents: &[Txid]) -> Transaction {
        let inputs = if parents.is_empty() {
            vec![bitcoin::TxIn {
                previous_output: bitcoin::OutPoint::null(),
                script_sig: bitcoin::ScriptBuf::new(),
                sequence: bitcoin::Sequence::MAX,
                witness: bitcoin::Witness::new(),
            }]
        } else {
            parents
                .iter()
                .map(|parent| bitcoin::TxIn {
                    previous_output: bitcoin::OutPoint {
                        txid: *parent,
                        vout: 0,
                    },
                    script_sig: bitcoin::ScriptBuf::new(),
                    sequence: bitcoin::Sequence::MAX,
                    witness: bitcoin::Witness::new(),
                })
                .collect()
        };
        Transaction {
            version: bitcoin::transaction::Version::TWO,
            lock_time: bitcoin::absolute::LockTime::ZERO,
            input: inputs,
            output: vec![],
        }
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
    fn should_sync_bumper_before_unroll_broadcast() {
        assert!(should_sync_bumper_wallet_before_unroll_broadcast(
            false, false
        ));
        assert!(should_sync_bumper_wallet_before_unroll_broadcast(
            true, true
        ));
        assert!(!should_sync_bumper_wallet_before_unroll_broadcast(
            false, true
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
    #[test]
    fn unroll_parent_txids_in_plan_keeps_only_branch_inputs() {
        let parent = dummy_tx_spending(&[txid(2), txid(9)]);
        assert_eq!(
            unroll_parent_txids_in_plan(&parent, &[txid(1), txid(2), txid(3)]),
            vec![txid(2)]
        );
    }

    #[test]
    fn unroll_ancestor_txids_oldest_first_walks_the_full_plan_chain() {
        let child = dummy_tx_spending(&[txid(3)]);
        let mut tx_by_id = HashMap::new();
        tx_by_id.insert(txid(1), dummy_tx_spending(&[]));
        tx_by_id.insert(txid(2), dummy_tx_spending(&[txid(1)]));
        tx_by_id.insert(txid(3), dummy_tx_spending(&[txid(2)]));
        tx_by_id.insert(txid(4), child.clone());
        assert_eq!(
            unroll_ancestor_txids_oldest_first(
                &child,
                &[txid(1), txid(2), txid(3), txid(4)],
                &tx_by_id
            ),
            vec![txid(1), txid(2), txid(3)]
        );
    }

    #[test]
    fn unroll_ancestor_txids_oldest_first_ignores_non_plan_inputs() {
        let child = dummy_tx_spending(&[txid(2), txid(9)]);
        let mut tx_by_id = HashMap::new();
        tx_by_id.insert(txid(1), dummy_tx_spending(&[]));
        tx_by_id.insert(txid(2), dummy_tx_spending(&[txid(1)]));
        tx_by_id.insert(txid(3), child.clone());
        assert_eq!(
            unroll_ancestor_txids_oldest_first(&child, &[txid(1), txid(2), txid(3)], &tx_by_id),
            vec![txid(1), txid(2)]
        );
    }

    #[test]
    fn unroll_ancestor_txids_oldest_first_orders_diamond_parents_by_plan_index() {
        let merge = dummy_tx_spending(&[txid(2), txid(3)]);
        let mut tx_by_id = HashMap::new();
        tx_by_id.insert(txid(1), dummy_tx_spending(&[]));
        tx_by_id.insert(txid(2), dummy_tx_spending(&[txid(1)]));
        tx_by_id.insert(txid(3), dummy_tx_spending(&[txid(1)]));
        tx_by_id.insert(txid(4), merge.clone());
        assert_eq!(
            unroll_ancestor_txids_oldest_first(
                &merge,
                &[txid(1), txid(2), txid(3), txid(4)],
                &tx_by_id
            ),
            vec![txid(1), txid(2), txid(3)]
        );
    }

    #[test]
    fn unroll_parent_txids_skipped_after_wait_ignores_already_submitted_parent() {
        let parents = vec![txid(1)];
        let ordered = [txid(1), txid(2), txid(3)];
        assert!(
            unroll_parent_txids_skipped_after_wait(&parents, &ordered, Some(0)).is_empty(),
            "parent at wait_index 0 was already submitted"
        );
        assert!(
            unroll_parent_txids_skipped_after_wait(&parents, &ordered, Some(1)).is_empty(),
            "parent before wait_index 1 was already submitted"
        );
        assert_eq!(
            unroll_parent_txids_skipped_after_wait(&parents, &ordered, None),
            vec![txid(1)],
            "without a wait stamp, cold-start skip still marks the parent"
        );
    }

    #[test]
    fn unroll_parent_txids_skipped_after_wait_keeps_unbroadcast_sibling() {
        let parents = vec![txid(2)];
        let ordered = [txid(1), txid(2), txid(3)];
        assert_eq!(
            unroll_parent_txids_skipped_after_wait(&parents, &ordered, Some(0)),
            vec![txid(2)]
        );
    }

    #[test]
    fn unroll_parent_txids_skipped_after_wait_drops_already_submitted_chain() {
        let ancestors = vec![txid(1), txid(2), txid(3)];
        let ordered = [txid(1), txid(2), txid(3), txid(4)];
        assert_eq!(
            unroll_parent_txids_skipped_after_wait(&ancestors, &ordered, Some(1)),
            vec![txid(3)]
        );
        assert!(unroll_parent_txids_skipped_after_wait(&ancestors, &ordered, Some(2)).is_empty());
    }

    #[test]
    fn unroll_parent_txs_from_plan_keeps_signed_parents() {
        let mut tx_by_id = HashMap::new();
        tx_by_id.insert(txid(1), dummy_tx_spending(&[]));
        tx_by_id.insert(txid(2), dummy_tx_spending(&[txid(1)]));
        let parents = vec![txid(2), txid(9)];
        let loaded = unroll_parent_txs_from_plan(&parents, &tx_by_id);
        assert_eq!(loaded.len(), 1);
        assert_eq!(
            loaded[0].compute_txid(),
            dummy_tx_spending(&[txid(1)]).compute_txid()
        );
    }

    #[test]
    fn unspendable_parent_blocks_until_broadcast_and_next_block() {
        assert!(!unspendable_parent_blocks_step(None, Some(10)));
        assert!(unspendable_parent_blocks_step(
            Some(&UnspendableParentState::NeedsBroadcast {
                marked_at_tip: Some(10)
            }),
            Some(11),
        ));
        assert!(unspendable_parent_blocks_step(
            Some(&UnspendableParentState::Broadcasted {
                broadcast_at_tip: Some(10)
            }),
            Some(10),
        ));
        assert!(!unspendable_parent_blocks_step(
            Some(&UnspendableParentState::Broadcasted {
                broadcast_at_tip: Some(10)
            }),
            Some(11),
        ));
    }

    #[test]
    fn force_broadcast_when_unspendable_even_if_esplora_confirmed() {
        assert!(should_force_unilateral_exit_step_broadcast(8, true));
        assert!(!should_force_unilateral_exit_step_broadcast(8, false));
        assert!(should_force_unilateral_exit_step_broadcast(0, false));
    }
}
