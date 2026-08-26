use std::collections::HashSet;

use bitcoin::Txid;

use crate::api_types::{
    UnilateralExitLeafStatusDto, UnilateralExitNodeStatusDto, UnilateralExitNodeStatusKind,
    UnilateralExitPhase, UnilateralExitProgressDto, UnilateralExitProgressParams,
};
use crate::constants::{UNILATERAL_EXIT_LEAF_CONFIRMATIONS, UNILATERAL_EXIT_STEP_CONFIRMATIONS};
use crate::error::{ArkResult, ArkWasmError};
use crate::esplora_blockchain::EsploraBlockchain;
use crate::outpoint::representative_vout_among_virtual_outpoints;

use super::plan::UnilateralBatchPlan;
use super::proceed::unilateral_exit_step_broadcast_satisfied;
use super::snapshot_ops::dedup_virtual_outpoints;
use super::watch::enrich_unilateral_exit_watches_for_leaf_tx_after_unroll;
use crate::session::ArkSession;

pub(crate) fn leaf_reached_finality(confirmations: u64) -> bool {
    confirmations >= u64::from(UNILATERAL_EXIT_LEAF_CONFIRMATIONS)
}

pub(crate) fn step_reached_confirmation(confirmations: u64) -> bool {
    confirmations >= u64::from(UNILATERAL_EXIT_STEP_CONFIRMATIONS)
}
/// Do not skip a step this wallet has not yet broadcast, even if Esplora paints it confirmed.
/// `wait_index` is the last step we submitted; the next index stays the cursor.
pub(crate) fn wait_cap_holds_unbroadcast_successor(
    index: usize,
    wait_index: Option<usize>,
) -> bool {
    wait_index.is_some_and(|wait| index > wait)
}

#[cfg(test)]
pub(crate) fn first_incomplete_step_from_confirmations(
    confirmations: &[u64],
    wait_index: Option<usize>,
) -> usize {
    for (index, &confs) in confirmations.iter().enumerate() {
        if !step_reached_confirmation(confs) {
            return index;
        }
        if wait_cap_holds_unbroadcast_successor(index, wait_index) {
            return index;
        }
    }
    confirmations.len()
}

pub(crate) fn node_status_label(
    confirmations: u64,
    is_current_step: bool,
) -> UnilateralExitNodeStatusKind {
    if step_reached_confirmation(confirmations) {
        UnilateralExitNodeStatusKind::Confirmed
    } else if is_current_step {
        UnilateralExitNodeStatusKind::InProgress
    } else {
        UnilateralExitNodeStatusKind::Pending
    }
}

/// Wait-capped successors are not complete for this wallet even if Esplora painted them.
pub(crate) fn displayed_unroll_step_confirmations(
    esplora_confirmations: u64,
    index: usize,
    wait_index: Option<usize>,
) -> u64 {
    if wait_cap_holds_unbroadcast_successor(index, wait_index) {
        0
    } else {
        esplora_confirmations
    }
}

pub(crate) fn displayed_unroll_node_status(
    esplora_confirmations: u64,
    index: usize,
    current_step_index: usize,
    wait_index: Option<usize>,
) -> UnilateralExitNodeStatusKind {
    if index == current_step_index {
        return UnilateralExitNodeStatusKind::InProgress;
    }
    if wait_cap_holds_unbroadcast_successor(index, wait_index) {
        return UnilateralExitNodeStatusKind::Pending;
    }
    node_status_label(esplora_confirmations, false)
}

pub(crate) async fn tx_confirmations(
    blockchain: &EsploraBlockchain,
    txid: &Txid,
) -> ArkResult<u64> {
    blockchain.get_tx_confirmations(txid).await
}

impl ArkSession {
    pub async fn get_unilateral_exit_progress(
        &self,
        params: UnilateralExitProgressParams,
    ) -> ArkResult<UnilateralExitProgressDto> {
        if params.vtxo_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }
        let virtual_outpoints = dedup_virtual_outpoints(params.vtxo_outpoints);
        let plan = self.build_unilateral_batch_plan(&virtual_outpoints).await?;
        let blockchain = self.client.blockchain();
        blockchain.prepare_confirmation_scan().await;
        self.mark_unrolled_leaves_at_finality(&plan).await?;
        let current_step_index = self
            .first_incomplete_step_index(blockchain, &plan.ordered_step_txids)
            .await?;
        let current_step_waiting_since = self
            .current_step_waiting_since(blockchain, &plan, current_step_index)
            .await?;
        let current_step_tx_relayed = self
            .current_step_tx_relayed(blockchain, &plan, current_step_index)
            .await?;
        let phase = if current_step_index >= plan.ordered_step_txids.len() {
            UnilateralExitPhase::Complete
        } else if current_step_waiting_since.is_some() || current_step_tx_relayed {
            let step_txid = plan.ordered_step_txids[current_step_index];
            let confirmations = tx_confirmations(blockchain, &step_txid).await?;
            if step_reached_confirmation(confirmations) {
                UnilateralExitPhase::Idle
            } else {
                UnilateralExitPhase::Waiting
            }
        } else {
            UnilateralExitPhase::Idle
        };

        let node_statuses = self
            .node_statuses_for_plan(blockchain, &plan, current_step_index)
            .await?;
        let leaf_statuses = self.leaf_statuses_for_plan(blockchain, &plan).await?;

        Ok(UnilateralExitProgressDto {
            step_index: current_step_index.min(plan.ordered_step_txids.len()) as u32,
            total_steps: plan.ordered_step_txids.len().max(1) as u32,
            phase,
            current_step_waiting_since,
            current_step_tx_relayed,
            node_statuses,
            leaf_statuses,
        })
    }

    pub(super) async fn first_incomplete_step_index(
        &self,
        blockchain: &EsploraBlockchain,
        ordered_step_txids: &[Txid],
    ) -> ArkResult<usize> {
        let wait_index = self
            .wallet_db
            .unilateral_exit_step_wait()
            .map(|record| record.step_index as usize);
        for (index, txid) in ordered_step_txids.iter().enumerate() {
            let confirmations = tx_confirmations(blockchain, txid).await?;
            if !step_reached_confirmation(confirmations)
                || wait_cap_holds_unbroadcast_successor(index, wait_index)
            {
                return Ok(index);
            }
            blockchain.store_confirmed_at_tip(*txid, confirmations);
        }
        Ok(ordered_step_txids.len())
    }

    /// Marks leaves unrolled in the local snapshot when chain depth is reached.
    /// Does not block on operator indexer polling — that runs during operator sync.
    pub(super) async fn mark_unrolled_leaves_at_finality(
        &self,
        plan: &UnilateralBatchPlan,
    ) -> ArkResult<()> {
        let blockchain = self.client.blockchain();
        let mut processed_leaf_txids = HashSet::new();

        for leaf in &plan.leaves {
            let leaf_virtual_txid = leaf.leaf_txid.to_string();
            let leaf_txid = leaf.leaf_txid;
            if !processed_leaf_txids.insert(leaf_txid) {
                continue;
            }
            if self.virtual_tx_is_marked_unrolled(&leaf_virtual_txid)? {
                continue;
            }
            if !leaf_reached_finality(tx_confirmations(blockchain, &leaf_txid).await?) {
                continue;
            }
            self.mark_leaf_virtual_tx_vtxos_unrolled_in_snapshot(&leaf_virtual_txid)?;
            enrich_unilateral_exit_watches_for_leaf_tx_after_unroll(
                &self.wallet_db,
                &leaf_virtual_txid,
                &leaf_txid.to_string(),
                &leaf.branch_txids,
            );
        }
        Ok(())
    }

    pub(super) fn virtual_tx_is_marked_unrolled(&self, txid: &str) -> ArkResult<bool> {
        let snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot;
        let Some(snapshot) = snapshot else {
            return Ok(false);
        };
        Ok(snapshot
            .virtual_tx_outpoints
            .iter()
            .any(|record| record.txid == txid && record.is_unrolled))
    }
    pub(super) async fn node_statuses_for_plan(
        &self,
        blockchain: &EsploraBlockchain,
        plan: &UnilateralBatchPlan,
        current_step_index: usize,
    ) -> ArkResult<Vec<UnilateralExitNodeStatusDto>> {
        let wait_index = self
            .wallet_db
            .unilateral_exit_step_wait()
            .map(|record| record.step_index as usize);
        let mut statuses = Vec::new();
        for (index, txid) in plan.ordered_step_txids.iter().enumerate() {
            let esplora_confirmations = tx_confirmations(blockchain, txid).await?;
            statuses.push(UnilateralExitNodeStatusDto {
                txid: txid.to_string(),
                confirmations: displayed_unroll_step_confirmations(
                    esplora_confirmations,
                    index,
                    wait_index,
                ),
                status: displayed_unroll_node_status(
                    esplora_confirmations,
                    index,
                    current_step_index,
                    wait_index,
                ),
            });
        }
        Ok(statuses)
    }

    pub(super) async fn leaf_statuses_for_plan(
        &self,
        blockchain: &EsploraBlockchain,
        plan: &UnilateralBatchPlan,
    ) -> ArkResult<Vec<UnilateralExitLeafStatusDto>> {
        let mut statuses = Vec::new();
        for leaf in &plan.leaves {
            let vtxo_txid = leaf.leaf_txid.to_string();
            let leaf_txid = leaf.leaf_txid;
            let representative_vout =
                representative_vout_among_virtual_outpoints(&leaf.sibling_outpoints);
            let confirmations = tx_confirmations(blockchain, &leaf_txid).await?;
            statuses.push(UnilateralExitLeafStatusDto {
                txid: vtxo_txid.clone(),
                vout: representative_vout,
                confirmations,
                is_unrolled: self.virtual_tx_is_marked_unrolled(&vtxo_txid)?,
            });
        }
        Ok(statuses)
    }

    pub(super) async fn current_step_waiting_since(
        &self,
        blockchain: &EsploraBlockchain,
        plan: &UnilateralBatchPlan,
        current_step_index: usize,
    ) -> ArkResult<Option<i64>> {
        if current_step_index >= plan.ordered_step_txids.len() {
            self.wallet_db.clear_unilateral_exit_step_wait();
            return Ok(None);
        }

        let step_txid = plan.ordered_step_txids[current_step_index];
        let confirmations = tx_confirmations(blockchain, &step_txid).await?;
        let step_wait = self.wallet_db.unilateral_exit_step_wait();
        let wait_matches_current = step_wait
            .as_ref()
            .is_some_and(|record| record.step_txid == step_txid.to_string());
        if wait_matches_current && step_reached_confirmation(confirmations) {
            self.wallet_db.clear_unilateral_exit_step_wait();
            return Ok(None);
        }

        Ok(self
            .wallet_db
            .unilateral_exit_step_wait()
            .filter(|record| record.step_txid == step_txid.to_string())
            .map(|record| record.started_at))
    }

    pub(super) async fn current_step_tx_relayed(
        &self,
        blockchain: &EsploraBlockchain,
        plan: &UnilateralBatchPlan,
        current_step_index: usize,
    ) -> ArkResult<bool> {
        if current_step_index >= plan.ordered_step_txids.len() {
            return Ok(true);
        }
        let step_txid = plan.ordered_step_txids[current_step_index];
        let step_wait = self.wallet_db.unilateral_exit_step_wait();
        if step_wait
            .as_ref()
            .is_none_or(|record| record.step_txid != step_txid.to_string())
        {
            // Unbroadcast successor: Esplora `/raw` can be ASP-indexed and still unusable
            // as a submitpackage parent. Require an actual proceed.
            return Ok(false);
        }
        let raw_relayed = blockchain.is_tx_relayed_on_network(&step_txid).await?;
        Ok(unilateral_exit_step_broadcast_satisfied(
            raw_relayed,
            &step_txid,
            step_wait.as_ref(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api_types::UnilateralExitNodeStatusKind;

    #[test]
    fn leaf_finality_requires_six_confirmations() {
        assert!(!leaf_reached_finality(5));
        assert!(leaf_reached_finality(6));
        assert!(leaf_reached_finality(10));
    }
    #[test]
    fn wait_cap_does_not_skip_sibling_checkpoint_after_last_broadcast() {
        let confs = [1, 1, 1, 1, 0];
        assert_eq!(
            first_incomplete_step_from_confirmations(&confs, Some(1)),
            2,
            "after wait at index 1, do not skip Esplora-confirmed index 2"
        );
        assert_eq!(first_incomplete_step_from_confirmations(&confs, Some(2)), 3);
        assert_eq!(
            first_incomplete_step_from_confirmations(&confs, None),
            4,
            "without a wait stamp, Esplora confs still skip to the first 0-conf"
        );
    }

    #[test]
    fn wait_cap_still_rewinds_when_an_earlier_step_drops_to_zero_conf() {
        let confs = [1, 0, 1, 1];
        assert_eq!(first_incomplete_step_from_confirmations(&confs, Some(2)), 1);
    }

    #[test]
    fn wait_capped_sibling_does_not_display_as_confirmed() {
        assert_eq!(displayed_unroll_step_confirmations(2, 4, Some(2)), 0);
        assert_eq!(
            displayed_unroll_node_status(2, 4, 3, Some(2)),
            UnilateralExitNodeStatusKind::Pending
        );
        assert_eq!(
            displayed_unroll_node_status(2, 3, 3, Some(2)),
            UnilateralExitNodeStatusKind::InProgress
        );
        assert_eq!(
            displayed_unroll_node_status(3, 2, 3, Some(2)),
            UnilateralExitNodeStatusKind::Confirmed
        );
    }
}
