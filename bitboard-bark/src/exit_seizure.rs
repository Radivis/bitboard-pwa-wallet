//! A confirmed spend of a chain anchor that is not the first exit transaction is
//! an anchor sweep. A confirmed spend of any earlier exit output, when the next
//! exit transaction is still unconfirmed, is a seizure of that node. The node
//! is a checkpoint when its continuation script matches Bark's checkpoint
//! policy, a leaf when it is the last tree transaction, and an internal node
//! otherwise. A non-checkpoint hop after the tree is an internal node. Bark
//! uses "branch" for the whole path, not for
//! one transaction. Another output of the same transaction stays spendable.
//! Each output of an anchor transaction is checked on its own, before hops.
//! Only the branch through a swept output is left out of the hop seizure
//! check. A branch through another output of that same transaction is still
//! checked. Every recorded outcome marks those coins spent before
//! refresh and keeps the transaction id of that spend. The VTXO outpoint itself
//! is never watched: Bark treats a spend of that output as the user's claim.

use std::collections::{BTreeMap, BTreeSet};

use bitcoin::{OutPoint, Txid};

/// What kind of exit transaction created a watched output.
///
/// A checkpoint is recognized by its continuation script. The last tree
/// transaction is the leaf, and every tree transaction before it is an
/// internal node. A non-checkpoint hop after the tree is an internal node:
/// the chain can continue through another internal node or an Arkoor payment.
/// Bark calls the path from the anchor to the leaf a branch; a branch is not
/// one transaction.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExitHopRole {
    Checkpoint,
    Leaf,
    Internal,
}

/// One exit transaction in a VTXO's history, in chain order. The last hop is
/// the VTXO outpoint.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExitHop {
    pub txid: Txid,
    pub output_index: u32,
    pub role: ExitHopRole,
}

/// Role of one hop. `prefix_len` is the number of tree transactions before
/// later hops. A checkpoint script wins over that position. The last tree
/// transaction is the leaf. Every other non-checkpoint hop is an internal
/// node, including a hop after the tree.
pub fn hop_role(is_checkpoint: bool, index: usize, prefix_len: usize) -> ExitHopRole {
    if is_checkpoint {
        return ExitHopRole::Checkpoint;
    }
    if index + 1 == prefix_len {
        return ExitHopRole::Leaf;
    }
    ExitHopRole::Internal
}

/// Unspent VTXO reduced to the outputs this scan can watch.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VtxoExitHistory {
    pub vtxo_id: String,
    pub anchor: OutPoint,
    pub hops: Vec<ExitHop>,
}

/// A confirmed foreign spend of a watched exit output.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum ExitChainOutcome {
    AnchorSweep(OutPoint),
    /// The spent checkpoint output. Sibling outputs of that transaction are not this seizure.
    CheckpointSeizure(OutPoint),
    /// The spent leaf output. Sibling outputs of that transaction are not this seizure.
    LeafSeizure(OutPoint),
    /// The spent internal-node output. Sibling outputs of that transaction are not this seizure.
    InternalSeizure(OutPoint),
}

/// An output to ask the chain about, and the only transaction allowed to spend it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WatchedExitOutput {
    pub outpoint: OutPoint,
    pub allowed_spend: Txid,
    pub outcome: ExitChainOutcome,
}

/// What the chain reported for one watched output. A read error is not a value
/// here: the caller skips that output.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExitOutputSpend {
    Unspent,
    Mempool { spender: Txid },
    Confirmed { spender: Txid },
}

/// Chain anchors of histories that have a first exit hop. Shared anchors are listed once.
pub fn watched_anchor_outputs(histories: &[VtxoExitHistory]) -> Vec<WatchedExitOutput> {
    let mut watched_by_outpoint = BTreeMap::<OutPoint, WatchedExitOutput>::new();
    for history in histories {
        if let Some(watched) = anchor_output_of_one(history) {
            watched_by_outpoint
                .entry(watched.outpoint)
                .or_insert(watched);
        }
    }
    watched_by_outpoint.into_values().collect()
}

/// Exit hop outputs whose next exit transaction is not confirmed. The last hop is
/// the VTXO outpoint and is left out. Shared outputs are listed once.
pub fn watched_hop_outputs(
    histories: &[VtxoExitHistory],
    confirmed_next_hop_txids: &BTreeSet<Txid>,
) -> Vec<WatchedExitOutput> {
    let mut watched_by_outpoint = BTreeMap::<OutPoint, WatchedExitOutput>::new();
    for history in histories {
        for watched in hop_outputs_of_one(history, confirmed_next_hop_txids) {
            watched_by_outpoint
                .entry(watched.outpoint)
                .or_insert(watched);
        }
    }
    watched_by_outpoint.into_values().collect()
}

/// Anchors, then hot hops. Shared outputs are listed once, and an anchor wins a clash.
pub fn watched_exit_outputs(
    histories: &[VtxoExitHistory],
    confirmed_next_hop_txids: &BTreeSet<Txid>,
) -> Vec<WatchedExitOutput> {
    let mut watched_by_outpoint = BTreeMap::<OutPoint, WatchedExitOutput>::new();
    for watched in watched_anchor_outputs(histories) {
        watched_by_outpoint
            .entry(watched.outpoint)
            .or_insert(watched);
    }
    for watched in watched_hop_outputs(histories, confirmed_next_hop_txids) {
        watched_by_outpoint
            .entry(watched.outpoint)
            .or_insert(watched);
    }
    watched_by_outpoint.into_values().collect()
}

/// Hot hops of branches that are still eligible after the anchor check.
/// An outpoint already watched as an anchor stays an anchor.
pub fn hop_outputs_after_anchor_check(
    histories: &[VtxoExitHistory],
    confirmed_next_hop_txids: &BTreeSet<Txid>,
    anchor_outpoints: &BTreeSet<OutPoint>,
) -> Vec<WatchedExitOutput> {
    watched_exit_outputs(histories, confirmed_next_hop_txids)
        .into_iter()
        .filter(|watched| !anchor_outpoints.contains(&watched.outpoint))
        .collect()
}

fn anchor_output_of_one(history: &VtxoExitHistory) -> Option<WatchedExitOutput> {
    let first_exit = history.hops.first()?;
    Some(WatchedExitOutput {
        outpoint: history.anchor,
        allowed_spend: first_exit.txid,
        outcome: ExitChainOutcome::AnchorSweep(history.anchor),
    })
}

fn hop_outputs_of_one(
    history: &VtxoExitHistory,
    confirmed_next_hop_txids: &BTreeSet<Txid>,
) -> Vec<WatchedExitOutput> {
    let mut watched = Vec::new();
    for (index, hop) in history.hops.iter().enumerate() {
        let Some(next_hop) = history.hops.get(index + 1) else {
            break;
        };
        if confirmed_next_hop_txids.contains(&next_hop.txid) {
            continue;
        }
        let outpoint = OutPoint {
            txid: hop.txid,
            vout: hop.output_index,
        };
        watched.push(WatchedExitOutput {
            outpoint,
            allowed_spend: next_hop.txid,
            outcome: seizure_outcome(hop.role, outpoint),
        });
    }
    watched
}

fn seizure_outcome(role: ExitHopRole, outpoint: OutPoint) -> ExitChainOutcome {
    match role {
        ExitHopRole::Checkpoint => ExitChainOutcome::CheckpointSeizure(outpoint),
        ExitHopRole::Leaf => ExitChainOutcome::LeafSeizure(outpoint),
        ExitHopRole::Internal => ExitChainOutcome::InternalSeizure(outpoint),
    }
}

/// A confirmed foreign spend of one watched exit output, and the transaction that spent it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct ExitChainForeignSpend {
    pub outcome: ExitChainOutcome,
    pub spender: Txid,
}

/// One VTXO named by a sweep or seizure, the transaction that spent the node, and that outpoint.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct ExitChainNoticeItem {
    pub vtxo_id: String,
    pub spender: Txid,
    pub spend_outpoint: OutPoint,
}

/// Confirmed spends whose transaction is not the allowed next exit transaction.
/// The spender txid is kept with the outcome.
pub fn exit_outcomes_from_spends(
    watched: &[WatchedExitOutput],
    spends: &BTreeMap<OutPoint, ExitOutputSpend>,
) -> Vec<ExitChainForeignSpend> {
    let mut foreign_spends = BTreeSet::new();
    for output in watched {
        let Some(ExitOutputSpend::Confirmed { spender }) = spends.get(&output.outpoint) else {
            continue;
        };
        if *spender != output.allowed_spend {
            foreign_spends.insert(ExitChainForeignSpend {
                outcome: output.outcome,
                spender: *spender,
            });
        }
    }
    foreign_spends.into_iter().collect()
}

/// Anchor sweeps and hop seizures as separate lists. A history whose anchor was
/// swept is left out of the seizure lists. One history can appear in more than
/// one seizure list when more than one of its hops was seized. Two spends of
/// the same kind on one history stay two items, distinguished by the spent output.
/// Each list is ordered by VTXO id, then spender, then spent output.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExitChainNotices {
    pub anchor_sweeps: Vec<ExitChainNoticeItem>,
    pub checkpoint_seizures: Vec<ExitChainNoticeItem>,
    pub leaf_seizures: Vec<ExitChainNoticeItem>,
    pub internal_seizures: Vec<ExitChainNoticeItem>,
}

pub fn split_exit_notices(
    histories: &[VtxoExitHistory],
    foreign_spends: &[ExitChainForeignSpend],
) -> ExitChainNotices {
    let mut anchor_sweeps = BTreeSet::new();
    let mut checkpoint_seizures = BTreeSet::new();
    let mut leaf_seizures = BTreeSet::new();
    let mut internal_seizures = BTreeSet::new();
    for history in histories {
        let matched = foreign_spends
            .iter()
            .copied()
            .filter(|foreign_spend| history_matches_outcome(history, foreign_spend.outcome))
            .collect::<Vec<_>>();
        let anchor_spends = recorded_spends_of_kind(&matched, ExitChainOutcomeKind::Anchor);
        if !anchor_spends.is_empty() {
            insert_notice_items(&mut anchor_sweeps, &history.vtxo_id, &anchor_spends);
            continue;
        }
        insert_notice_items(
            &mut checkpoint_seizures,
            &history.vtxo_id,
            &recorded_spends_of_kind(&matched, ExitChainOutcomeKind::Checkpoint),
        );
        insert_notice_items(
            &mut leaf_seizures,
            &history.vtxo_id,
            &recorded_spends_of_kind(&matched, ExitChainOutcomeKind::Leaf),
        );
        insert_notice_items(
            &mut internal_seizures,
            &history.vtxo_id,
            &recorded_spends_of_kind(&matched, ExitChainOutcomeKind::Internal),
        );
    }
    ExitChainNotices {
        anchor_sweeps: anchor_sweeps.into_iter().collect(),
        checkpoint_seizures: checkpoint_seizures.into_iter().collect(),
        leaf_seizures: leaf_seizures.into_iter().collect(),
        internal_seizures: internal_seizures.into_iter().collect(),
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ExitChainOutcomeKind {
    Anchor,
    Checkpoint,
    Leaf,
    Internal,
}

fn outcome_kind(outcome: ExitChainOutcome) -> ExitChainOutcomeKind {
    match outcome {
        ExitChainOutcome::AnchorSweep(_) => ExitChainOutcomeKind::Anchor,
        ExitChainOutcome::CheckpointSeizure(_) => ExitChainOutcomeKind::Checkpoint,
        ExitChainOutcome::LeafSeizure(_) => ExitChainOutcomeKind::Leaf,
        ExitChainOutcome::InternalSeizure(_) => ExitChainOutcomeKind::Internal,
    }
}

fn spend_outpoint_of(outcome: ExitChainOutcome) -> OutPoint {
    match outcome {
        ExitChainOutcome::AnchorSweep(spent)
        | ExitChainOutcome::CheckpointSeizure(spent)
        | ExitChainOutcome::LeafSeizure(spent)
        | ExitChainOutcome::InternalSeizure(spent) => spent,
    }
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct RecordedSpend {
    spender: Txid,
    spend_outpoint: OutPoint,
}

fn recorded_spends_of_kind(
    matched: &[ExitChainForeignSpend],
    kind: ExitChainOutcomeKind,
) -> Vec<RecordedSpend> {
    let mut spends = BTreeSet::new();
    for foreign_spend in matched {
        if outcome_kind(foreign_spend.outcome) != kind {
            continue;
        }
        spends.insert(RecordedSpend {
            spender: foreign_spend.spender,
            spend_outpoint: spend_outpoint_of(foreign_spend.outcome),
        });
    }
    spends.into_iter().collect()
}

fn insert_notice_items(
    items: &mut BTreeSet<ExitChainNoticeItem>,
    vtxo_id: &str,
    spends: &[RecordedSpend],
) {
    for spend in spends {
        items.insert(ExitChainNoticeItem {
            vtxo_id: vtxo_id.to_owned(),
            spender: spend.spender,
            spend_outpoint: spend.spend_outpoint,
        });
    }
}

fn history_matches_outcome(history: &VtxoExitHistory, outcome: ExitChainOutcome) -> bool {
    match outcome {
        ExitChainOutcome::AnchorSweep(anchor) => history.anchor == anchor,
        ExitChainOutcome::CheckpointSeizure(spent)
        | ExitChainOutcome::LeafSeizure(spent)
        | ExitChainOutcome::InternalSeizure(spent) => history
            .hops
            .iter()
            .any(|hop| hop.txid == spent.txid && hop.output_index == spent.vout),
    }
}

#[cfg(target_arch = "wasm32")]
mod scan {
    use std::cell::RefCell;
    use std::collections::{BTreeMap, BTreeSet};

    use bitcoin::{OutPoint, Txid};

    use serde::Serialize;

    use super::{
        ExitHop, ExitOutputSpend, VtxoExitHistory, exit_outcomes_from_spends,
        hop_outputs_after_anchor_check, split_exit_notices, watched_anchor_outputs,
    };

    #[derive(Clone, Serialize)]
    struct RecordedExitNodeSweepVtxoItem {
        #[serde(rename = "vtxoId")]
        vtxo_id: String,
        #[serde(rename = "nodeKind")]
        node_kind: &'static str,
        #[serde(rename = "spenderTxid")]
        spender_txid: String,
        #[serde(rename = "spentTxid")]
        spent_txid: String,
        #[serde(rename = "spentVout")]
        spent_vout: u32,
    }

    #[derive(Clone, Serialize)]
    struct RecordedExitChainNotices {
        #[serde(rename = "exitNodeSweepVtxoItems")]
        exit_node_sweep_vtxo_items: Vec<RecordedExitNodeSweepVtxoItem>,
    }

    impl RecordedExitChainNotices {
        fn empty() -> Self {
            Self {
                exit_node_sweep_vtxo_items: Vec::new(),
            }
        }
    }

    thread_local! {
        static LAST_EXIT_CHAIN_NOTICES: RefCell<RecordedExitChainNotices> =
            RefCell::new(RecordedExitChainNotices::empty());
    }

    pub(crate) fn clear_exit_chain_notices() {
        LAST_EXIT_CHAIN_NOTICES.with(|slot| *slot.borrow_mut() = RecordedExitChainNotices::empty());
    }

    pub(crate) fn exit_chain_notices_json() -> String {
        LAST_EXIT_CHAIN_NOTICES.with(|slot| {
            serde_json::to_string(&*slot.borrow())
                .unwrap_or_else(|_| r#"{"exitNodeSweepVtxoItems":[]}"#.to_owned())
        })
    }

    /// Best-effort. A wallet-store failure, or a chain read that does not cover
    /// every watched output, leaves the previous lists in place and does not
    /// mark any VTXO spent. A chain error is neither a sweep nor a seizure.
    pub(crate) async fn record_exit_chain_notices(wallet: &bark::Wallet) {
        match scan_exit_chain_notices(wallet).await {
            Ok(recorded) => remember(recorded),
            Err(err) => warn(&format!(
                "Bark could not scan exit outputs for a sweep or seizure: {err}"
            )),
        }
    }

    fn remember(recorded: RecordedExitChainNotices) {
        LAST_EXIT_CHAIN_NOTICES.with(|slot| *slot.borrow_mut() = recorded);
    }

    async fn scan_exit_chain_notices(
        wallet: &bark::Wallet,
    ) -> Result<RecordedExitChainNotices, String> {
        let unspent = wallet.vtxos().await.map_err(|err| err.to_string())?;
        let full_vtxos = wallet
            .get_full_vtxos(&unspent)
            .await
            .map_err(|err| err.to_string())?;
        let histories = full_vtxos
            .iter()
            .map(history_from_full_vtxo)
            .collect::<Vec<_>>();
        let recorded = notices_for_histories(wallet, &histories).await?;
        let spent_ids = recorded
            .exit_node_sweep_vtxo_items
            .iter()
            .map(|item| item.vtxo_id.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        if !spent_ids.is_empty() {
            mark_ids_spent(wallet, &unspent, &spent_ids).await?;
        }
        Ok(recorded)
    }

    /// Fills in the spent output for VTXOs already stored on a notice. Those coins
    /// are already marked spent, so the unspent scan never sees them again.
    /// A missing VTXO is skipped. A chain read that does not cover every watched
    /// output returns an error and leaves the stored notice unchanged.
    pub(crate) async fn backfill_exit_chain_notices_json(
        wallet: &bark::Wallet,
        vtxo_ids: &[String],
    ) -> Result<String, String> {
        let histories = histories_for_stored_vtxo_ids(wallet, vtxo_ids).await;
        let recorded = notices_for_histories(wallet, &histories).await?;
        serde_json::to_string(&recorded).map_err(|err| err.to_string())
    }

    async fn histories_for_stored_vtxo_ids(
        wallet: &bark::Wallet,
        vtxo_ids: &[String],
    ) -> Vec<VtxoExitHistory> {
        let mut histories = Vec::new();
        for vtxo_id in vtxo_ids {
            let Ok(parsed) = vtxo_id.parse::<bark::ark::VtxoId>() else {
                continue;
            };
            let Ok(full) = wallet.get_full_vtxo(parsed).await else {
                continue;
            };
            histories.push(history_from_full_vtxo(&full));
        }
        histories
    }

    async fn notices_for_histories(
        wallet: &bark::Wallet,
        histories: &[VtxoExitHistory],
    ) -> Result<RecordedExitChainNotices, String> {
        let confirmed_next_hops = confirmed_next_hop_txids(wallet, histories).await;
        let anchor_watched = watched_anchor_outputs(histories);
        let anchor_spends = spend_by_outpoint(wallet, &anchor_watched).await?;
        let anchor_outcomes = exit_outcomes_from_spends(&anchor_watched, &anchor_spends);
        let anchor_notices = split_exit_notices(histories, &anchor_outcomes);
        let swept_anchor_ids = anchor_notices
            .anchor_sweeps
            .iter()
            .map(|item| item.vtxo_id.as_str())
            .collect::<BTreeSet<_>>();
        let remaining = histories
            .iter()
            .filter(|history| !swept_anchor_ids.contains(history.vtxo_id.as_str()))
            .cloned()
            .collect::<Vec<_>>();
        let anchor_outpoints = anchor_watched
            .iter()
            .map(|watched| watched.outpoint)
            .collect::<BTreeSet<_>>();
        let hop_watched =
            hop_outputs_after_anchor_check(&remaining, &confirmed_next_hops, &anchor_outpoints);
        let hop_spends = spend_by_outpoint(wallet, &hop_watched).await?;
        let hop_outcomes = exit_outcomes_from_spends(&hop_watched, &hop_spends);
        let hop_notices = split_exit_notices(&remaining, &hop_outcomes);
        Ok(RecordedExitChainNotices {
            exit_node_sweep_vtxo_items: recorded_items(&anchor_notices, &hop_notices),
        })
    }

    fn recorded_items(
        anchor_notices: &super::ExitChainNotices,
        hop_notices: &super::ExitChainNotices,
    ) -> Vec<RecordedExitNodeSweepVtxoItem> {
        let mut items = Vec::new();
        push_recorded_items(&mut items, &anchor_notices.anchor_sweeps, "anchor");
        push_recorded_items(&mut items, &hop_notices.internal_seizures, "internal");
        push_recorded_items(&mut items, &hop_notices.leaf_seizures, "leaf");
        push_recorded_items(&mut items, &hop_notices.checkpoint_seizures, "checkpoint");
        items
    }

    fn push_recorded_items(
        items: &mut Vec<RecordedExitNodeSweepVtxoItem>,
        notices: &[super::ExitChainNoticeItem],
        node_kind: &'static str,
    ) {
        for notice in notices {
            items.push(RecordedExitNodeSweepVtxoItem {
                vtxo_id: notice.vtxo_id.clone(),
                node_kind,
                spender_txid: notice.spender.to_string(),
                spent_txid: notice.spend_outpoint.txid.to_string(),
                spent_vout: notice.spend_outpoint.vout,
            });
        }
    }

    fn history_from_full_vtxo(vtxo: &bark::ark::Vtxo<bark::ark::vtxo::Full>) -> VtxoExitHistory {
        let items = vtxo.transactions().collect::<Vec<_>>();
        let continuation_scripts = items
            .iter()
            .map(|item| {
                item.tx
                    .output
                    .get(item.output_idx)
                    .map(|output| output.script_pubkey.clone())
                    .unwrap_or_else(bitcoin::ScriptBuf::new)
            })
            .collect::<Vec<_>>();
        let arkoor_pubkeys = vtxo.past_arkoor_pubkeys();
        let tx_types = crate::emergency_exit::exit_graph_tx_types(
            &continuation_scripts,
            &arkoor_pubkeys,
            vtxo.server_pubkey(),
            vtxo.exit_delta(),
            vtxo.expiry_height(),
        );
        let prefix_len = if arkoor_pubkeys.len() > items.len() {
            items.len()
        } else {
            items.len() - arkoor_pubkeys.len()
        };
        let hops = items
            .iter()
            .zip(tx_types)
            .enumerate()
            .map(|(index, (item, tx_type))| ExitHop {
                txid: item.tx.compute_txid(),
                output_index: item.output_idx as u32,
                role: super::hop_role(
                    tx_type == crate::emergency_exit::ExitGraphTxType::Checkpoint,
                    index,
                    prefix_len,
                ),
            })
            .collect();
        VtxoExitHistory {
            vtxo_id: vtxo.id().to_string(),
            anchor: vtxo.chain_anchor(),
            hops,
        }
    }

    async fn confirmed_next_hop_txids(
        wallet: &bark::Wallet,
        histories: &[VtxoExitHistory],
    ) -> BTreeSet<Txid> {
        let mut next_hop_txids = BTreeSet::new();
        for history in histories {
            for (index, _hop) in history.hops.iter().enumerate() {
                if let Some(next_hop) = history.hops.get(index + 1) {
                    next_hop_txids.insert(next_hop.txid);
                }
            }
        }
        let mut confirmed = BTreeSet::new();
        for txid in next_hop_txids {
            match wallet.chain().tx_status(txid).await {
                Ok(status) if status.is_confirmed() => {
                    confirmed.insert(txid);
                }
                Ok(_) => {}
                Err(err) => warn(&format!(
                    "Bark could not read exit transaction {txid}: {err:#}"
                )),
            }
        }
        confirmed
    }

    async fn spend_by_outpoint(
        wallet: &bark::Wallet,
        watched: &[super::WatchedExitOutput],
    ) -> Result<BTreeMap<OutPoint, ExitOutputSpend>, String> {
        let mut spends = BTreeMap::new();
        for output in watched {
            match wallet
                .chain()
                .txs_spending_inputs([output.outpoint], 0)
                .await
            {
                Ok(result) => {
                    spends.insert(
                        output.outpoint,
                        spend_from_result(&output.outpoint, &result),
                    );
                }
                Err(err) => {
                    let message =
                        format!("Bark could not read spends of {}: {err:#}", output.outpoint);
                    warn(&message);
                    return Err(message);
                }
            }
        }
        Ok(spends)
    }

    fn spend_from_result(
        outpoint: &OutPoint,
        result: &bark::chain::TxsSpendingInputsResult,
    ) -> ExitOutputSpend {
        match result.get(outpoint) {
            None => ExitOutputSpend::Unspent,
            Some((spender, status)) if status.is_confirmed() => {
                ExitOutputSpend::Confirmed { spender: *spender }
            }
            Some((spender, _)) => ExitOutputSpend::Mempool { spender: *spender },
        }
    }

    async fn mark_ids_spent(
        wallet: &bark::Wallet,
        unspent: &[bark::vtxo::WalletVtxo],
        ids: &[String],
    ) -> Result<(), String> {
        let matched = unspent
            .iter()
            .filter(|vtxo| ids.iter().any(|id| id == &vtxo.id().to_string()))
            .collect::<Vec<_>>();
        if matched.is_empty() {
            return Ok(());
        }
        wallet
            .mark_vtxos_as_spent(matched)
            .await
            .map_err(|err| err.to_string())
    }

    #[wasm_bindgen::prelude::wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_namespace = console, js_name = warn)]
        fn console_warn(message: &str);
    }

    fn warn(message: &str) {
        console_warn(message);
    }
}

#[cfg(target_arch = "wasm32")]
pub(crate) use scan::{
    backfill_exit_chain_notices_json, clear_exit_chain_notices, exit_chain_notices_json,
    record_exit_chain_notices,
};

#[cfg(test)]
mod tests {
    use super::{
        ExitChainForeignSpend, ExitChainNoticeItem, ExitChainNotices, ExitChainOutcome, ExitHop,
        ExitHopRole, ExitOutputSpend, VtxoExitHistory, exit_outcomes_from_spends,
        hop_outputs_after_anchor_check, hop_role, split_exit_notices, watched_exit_outputs,
    };
    use bitcoin::hashes::Hash;
    use bitcoin::{OutPoint, Txid};
    use std::collections::{BTreeMap, BTreeSet};

    fn txid(byte: u8) -> Txid {
        let mut raw = [0u8; 32];
        raw[31] = byte;
        Txid::from_byte_array(raw)
    }

    fn outpoint(byte: u8, vout: u32) -> OutPoint {
        OutPoint {
            txid: txid(byte),
            vout,
        }
    }

    fn hop(byte: u8, output_index: u32, role: ExitHopRole) -> ExitHop {
        ExitHop {
            txid: txid(byte),
            output_index,
            role,
        }
    }

    fn foreign_spend(outcome: ExitChainOutcome, spender_byte: u8) -> ExitChainForeignSpend {
        ExitChainForeignSpend {
            outcome,
            spender: txid(spender_byte),
        }
    }

    fn notice_item(
        vtxo_id: &str,
        spender_byte: u8,
        spend_outpoint: OutPoint,
    ) -> ExitChainNoticeItem {
        ExitChainNoticeItem {
            vtxo_id: vtxo_id.to_owned(),
            spender: txid(spender_byte),
            spend_outpoint,
        }
    }

    fn notices(
        anchor: &[ExitChainNoticeItem],
        checkpoint: &[ExitChainNoticeItem],
        leaf: &[ExitChainNoticeItem],
        internal: &[ExitChainNoticeItem],
    ) -> ExitChainNotices {
        ExitChainNotices {
            anchor_sweeps: anchor.to_vec(),
            checkpoint_seizures: checkpoint.to_vec(),
            leaf_seizures: leaf.to_vec(),
            internal_seizures: internal.to_vec(),
        }
    }

    fn history(vtxo_id: &str, anchor: OutPoint, hops: Vec<ExitHop>) -> VtxoExitHistory {
        VtxoExitHistory {
            vtxo_id: vtxo_id.to_owned(),
            anchor,
            hops,
        }
    }

    fn chain_with_hot_checkpoint() -> VtxoExitHistory {
        history(
            "probed",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(20, 1, ExitHopRole::Checkpoint),
                hop(30, 0, ExitHopRole::Leaf),
            ],
        )
    }

    #[test]
    fn an_anchor_keeps_an_outpoint_that_is_also_a_hop() {
        let shared = outpoint(10, 0);
        let histories = [
            history(
                "anchored",
                shared,
                vec![
                    hop(20, 0, ExitHopRole::Internal),
                    hop(21, 0, ExitHopRole::Leaf),
                ],
            ),
            history(
                "through-hop",
                outpoint(1, 0),
                vec![
                    hop(10, 0, ExitHopRole::Internal),
                    hop(30, 0, ExitHopRole::Leaf),
                ],
            ),
        ];

        let watched = watched_exit_outputs(&histories, &BTreeSet::new());
        let shared_watch = watched
            .iter()
            .find(|output| output.outpoint == shared)
            .expect("shared outpoint is watched");

        assert_eq!(shared_watch.outcome, ExitChainOutcome::AnchorSweep(shared));
        assert_eq!(shared_watch.allowed_spend, txid(20));
        assert_eq!(
            watched
                .iter()
                .filter(|output| output.outpoint == shared)
                .count(),
            1
        );

        let anchor_outpoints = BTreeSet::from([shared, outpoint(1, 0)]);
        let hops = hop_outputs_after_anchor_check(&histories, &BTreeSet::new(), &anchor_outpoints);
        assert!(hops.iter().all(|output| output.outpoint != shared));
        assert!(hops.iter().any(|output| output.outpoint == outpoint(20, 0)));
    }

    #[test]
    fn an_anchor_or_hot_checkpoint_spent_by_the_next_exit_tx_is_not_recorded() {
        let histories = [chain_with_hot_checkpoint()];
        let watched = watched_exit_outputs(&histories, &BTreeSet::new());
        let spends = BTreeMap::from([
            (
                outpoint(1, 0),
                ExitOutputSpend::Confirmed { spender: txid(10) },
            ),
            (
                outpoint(10, 0),
                ExitOutputSpend::Confirmed { spender: txid(20) },
            ),
            (
                outpoint(20, 1),
                ExitOutputSpend::Confirmed { spender: txid(30) },
            ),
        ]);

        assert!(exit_outcomes_from_spends(&watched, &spends).is_empty());
    }

    #[test]
    fn a_confirmed_spend_by_another_transaction_is_a_seizure() {
        let histories = [chain_with_hot_checkpoint()];
        let watched = watched_exit_outputs(&histories, &BTreeSet::new());
        let spends = BTreeMap::from([(
            outpoint(20, 1),
            ExitOutputSpend::Confirmed { spender: txid(99) },
        )]);

        assert_eq!(
            exit_outcomes_from_spends(&watched, &spends),
            vec![foreign_spend(
                ExitChainOutcome::CheckpointSeizure(outpoint(20, 1)),
                99
            )]
        );
        assert_eq!(
            split_exit_notices(&histories, &exit_outcomes_from_spends(&watched, &spends)),
            notices(&[], &[notice_item("probed", 99, outpoint(20, 1))], &[], &[])
        );
    }

    #[test]
    fn a_checkpoint_whose_next_transaction_is_confirmed_is_not_watched() {
        let histories = [chain_with_hot_checkpoint()];
        let mut confirmed = BTreeSet::new();
        confirmed.insert(txid(30));
        let watched = watched_exit_outputs(&histories, &confirmed);

        assert!(
            watched
                .iter()
                .all(|output| output.outpoint != outpoint(20, 1))
        );
        assert!(
            watched
                .iter()
                .any(|output| output.outpoint == outpoint(1, 0))
        );
    }

    #[test]
    fn a_seized_checkpoint_output_selects_every_vtxo_that_continues_through_it() {
        let probed = chain_with_hot_checkpoint();
        let locked_sibling = history(
            "locked-sibling",
            outpoint(2, 0),
            vec![
                hop(20, 1, ExitHopRole::Checkpoint),
                hop(40, 0, ExitHopRole::Leaf),
            ],
        );
        let unrelated = history("other", outpoint(3, 0), vec![hop(50, 0, ExitHopRole::Leaf)]);
        let histories = [probed, locked_sibling, unrelated];
        let foreign_spends = [foreign_spend(
            ExitChainOutcome::CheckpointSeizure(outpoint(20, 1)),
            99,
        )];

        assert_eq!(
            split_exit_notices(&histories, &foreign_spends),
            notices(
                &[],
                &[
                    notice_item("locked-sibling", 99, outpoint(20, 1)),
                    notice_item("probed", 99, outpoint(20, 1)),
                ],
                &[],
                &[],
            )
        );
    }

    #[test]
    fn a_seized_checkpoint_output_leaves_a_sibling_output_of_the_same_transaction_spendable() {
        let swept_destination = history(
            "swept-destination",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(20, 0, ExitHopRole::Checkpoint),
                hop(30, 0, ExitHopRole::Leaf),
            ],
        );
        let change_destination = history(
            "change-destination",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(20, 1, ExitHopRole::Checkpoint),
                hop(40, 0, ExitHopRole::Leaf),
            ],
        );
        let foreign_spends = [foreign_spend(
            ExitChainOutcome::CheckpointSeizure(outpoint(20, 0)),
            99,
        )];

        assert_eq!(
            split_exit_notices(&[swept_destination, change_destination], &foreign_spends),
            notices(
                &[],
                &[notice_item("swept-destination", 99, outpoint(20, 0))],
                &[],
                &[],
            )
        );
    }

    #[test]
    fn a_swept_anchor_selects_every_unspent_vtxo_with_that_anchor() {
        let shared = outpoint(1, 0);
        let histories = [
            history("first", shared, vec![hop(10, 0, ExitHopRole::Leaf)]),
            history("second", shared, vec![hop(11, 0, ExitHopRole::Leaf)]),
            history("other", outpoint(3, 0), vec![hop(50, 0, ExitHopRole::Leaf)]),
        ];
        let foreign_spends = [foreign_spend(ExitChainOutcome::AnchorSweep(shared), 99)];

        assert_eq!(
            split_exit_notices(&histories, &foreign_spends),
            notices(
                &[
                    notice_item("first", 99, outpoint(1, 0)),
                    notice_item("second", 99, outpoint(1, 0)),
                ],
                &[],
                &[],
                &[],
            )
        );
    }

    #[test]
    fn a_swept_anchor_output_leaves_a_sibling_output_of_the_same_transaction_eligible() {
        let swept_branch = history(
            "swept-branch",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(20, 1, ExitHopRole::Checkpoint),
                hop(30, 0, ExitHopRole::Leaf),
            ],
        );
        let sibling_branch = history(
            "sibling-branch",
            outpoint(1, 1),
            vec![
                hop(40, 0, ExitHopRole::Internal),
                hop(50, 1, ExitHopRole::Checkpoint),
                hop(60, 0, ExitHopRole::Leaf),
            ],
        );
        let foreign_spends = [
            foreign_spend(ExitChainOutcome::AnchorSweep(outpoint(1, 0)), 99),
            foreign_spend(ExitChainOutcome::CheckpointSeizure(outpoint(20, 1)), 98),
            foreign_spend(ExitChainOutcome::CheckpointSeizure(outpoint(50, 1)), 97),
        ];

        assert_eq!(
            split_exit_notices(&[swept_branch, sibling_branch], &foreign_spends),
            notices(
                &[notice_item("swept-branch", 99, outpoint(1, 0))],
                &[notice_item("sibling-branch", 97, outpoint(50, 1))],
                &[],
                &[],
            )
        );
    }

    #[test]
    fn an_anchor_sweep_excludes_that_history_from_the_checkpoint_seizure_list() {
        let shared_anchor = outpoint(1, 0);
        let anchor_coin = history(
            "anchor-coin",
            shared_anchor,
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(20, 1, ExitHopRole::Checkpoint),
                hop(30, 0, ExitHopRole::Leaf),
            ],
        );
        let checkpoint_coin = history(
            "checkpoint-coin",
            outpoint(2, 0),
            vec![
                hop(40, 0, ExitHopRole::Internal),
                hop(50, 1, ExitHopRole::Checkpoint),
                hop(60, 0, ExitHopRole::Leaf),
            ],
        );
        let foreign_spends = [
            foreign_spend(ExitChainOutcome::AnchorSweep(shared_anchor), 99),
            foreign_spend(ExitChainOutcome::CheckpointSeizure(outpoint(20, 1)), 98),
            foreign_spend(ExitChainOutcome::CheckpointSeizure(outpoint(50, 1)), 97),
        ];

        assert_eq!(
            split_exit_notices(&[anchor_coin, checkpoint_coin], &foreign_spends),
            notices(
                &[notice_item("anchor-coin", 99, shared_anchor)],
                &[notice_item("checkpoint-coin", 97, outpoint(50, 1))],
                &[],
                &[],
            )
        );
    }

    #[test]
    fn the_vtxo_outpoint_is_not_watched_even_when_it_is_a_checkpoint() {
        let histories = [history(
            "leaf-checkpoint",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(70, 2, ExitHopRole::Checkpoint),
            ],
        )];
        let watched = watched_exit_outputs(&histories, &BTreeSet::new());

        assert!(
            watched
                .iter()
                .any(|output| output.outpoint == outpoint(1, 0))
        );
        assert!(
            watched
                .iter()
                .any(|output| output.outpoint == outpoint(10, 0))
        );
        assert!(
            watched
                .iter()
                .all(|output| output.outpoint != outpoint(70, 2))
        );
    }

    #[test]
    fn a_missing_unspent_or_mempool_spend_is_not_a_seizure() {
        let histories = [chain_with_hot_checkpoint()];
        let watched = watched_exit_outputs(&histories, &BTreeSet::new());
        let spends = BTreeMap::from([
            (outpoint(1, 0), ExitOutputSpend::Unspent),
            (
                outpoint(20, 1),
                ExitOutputSpend::Mempool { spender: txid(99) },
            ),
        ]);

        assert!(exit_outcomes_from_spends(&watched, &spends).is_empty());
    }

    #[test]
    fn an_internal_node_and_a_leaf_output_are_watched_until_the_vtxo_outpoint() {
        let histories = [history(
            "tree-only",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(15, 1, ExitHopRole::Leaf),
                hop(16, 0, ExitHopRole::Leaf),
            ],
        )];
        let watched = watched_exit_outputs(&histories, &BTreeSet::new());

        assert_eq!(
            watched
                .iter()
                .map(|output| output.outpoint)
                .collect::<Vec<_>>(),
            vec![outpoint(1, 0), outpoint(10, 0), outpoint(15, 1)]
        );
    }

    #[test]
    fn a_hop_whose_next_exit_transaction_is_confirmed_is_not_watched() {
        let histories = [history(
            "tree-only",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(15, 1, ExitHopRole::Leaf),
                hop(16, 0, ExitHopRole::Leaf),
            ],
        )];
        let mut confirmed = BTreeSet::new();
        confirmed.insert(txid(15));
        let watched = watched_exit_outputs(&histories, &confirmed);

        assert!(
            watched
                .iter()
                .all(|output| output.outpoint != outpoint(10, 0))
        );
        assert!(
            watched
                .iter()
                .any(|output| output.outpoint == outpoint(15, 1))
        );
    }

    #[test]
    fn a_foreign_spend_of_an_internal_node_is_recorded_as_that_node() {
        let histories = [history(
            "tree-coin",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(15, 1, ExitHopRole::Leaf),
                hop(16, 0, ExitHopRole::Leaf),
            ],
        )];
        let watched = watched_exit_outputs(&histories, &BTreeSet::new());
        let spends = BTreeMap::from([(
            outpoint(10, 0),
            ExitOutputSpend::Confirmed { spender: txid(99) },
        )]);

        assert_eq!(
            exit_outcomes_from_spends(&watched, &spends),
            vec![foreign_spend(
                ExitChainOutcome::InternalSeizure(outpoint(10, 0)),
                99
            )]
        );
        assert_eq!(
            split_exit_notices(&histories, &exit_outcomes_from_spends(&watched, &spends)),
            notices(
                &[],
                &[],
                &[],
                &[notice_item("tree-coin", 99, outpoint(10, 0))]
            )
        );
    }

    #[test]
    fn a_foreign_spend_of_a_leaf_output_is_recorded_as_a_leaf() {
        let histories = [history(
            "tree-coin",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(15, 1, ExitHopRole::Leaf),
                hop(16, 0, ExitHopRole::Leaf),
            ],
        )];
        let watched = watched_exit_outputs(&histories, &BTreeSet::new());
        let spends = BTreeMap::from([(
            outpoint(15, 1),
            ExitOutputSpend::Confirmed { spender: txid(99) },
        )]);

        assert_eq!(
            exit_outcomes_from_spends(&watched, &spends),
            vec![foreign_spend(
                ExitChainOutcome::LeafSeizure(outpoint(15, 1)),
                99
            )]
        );
        assert_eq!(
            split_exit_notices(&histories, &exit_outcomes_from_spends(&watched, &spends)),
            notices(
                &[],
                &[],
                &[notice_item("tree-coin", 99, outpoint(15, 1))],
                &[]
            )
        );
    }

    #[test]
    fn a_seized_internal_output_leaves_a_sibling_output_spendable() {
        let swept = history(
            "swept-child",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(15, 0, ExitHopRole::Leaf),
            ],
        );
        let sibling = history(
            "sibling-child",
            outpoint(1, 0),
            vec![
                hop(10, 1, ExitHopRole::Internal),
                hop(16, 0, ExitHopRole::Leaf),
            ],
        );

        assert_eq!(
            split_exit_notices(
                &[swept, sibling],
                &[foreign_spend(
                    ExitChainOutcome::InternalSeizure(outpoint(10, 0)),
                    99
                )]
            ),
            notices(
                &[],
                &[],
                &[],
                &[notice_item("swept-child", 99, outpoint(10, 0))]
            )
        );
    }

    #[test]
    fn a_history_records_every_seized_hop_without_preferring_one() {
        let histories = [chain_with_hot_checkpoint()];
        let foreign_spends = [
            foreign_spend(ExitChainOutcome::InternalSeizure(outpoint(10, 0)), 99),
            foreign_spend(ExitChainOutcome::CheckpointSeizure(outpoint(20, 1)), 98),
        ];

        assert_eq!(
            split_exit_notices(&histories, &foreign_spends),
            notices(
                &[],
                &[notice_item("probed", 98, outpoint(20, 1))],
                &[],
                &[notice_item("probed", 99, outpoint(10, 0))],
            )
        );
    }

    #[test]
    fn two_seized_hops_of_the_same_kind_stay_two_items() {
        let histories = [history(
            "tree-coin",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(12, 0, ExitHopRole::Internal),
                hop(15, 1, ExitHopRole::Leaf),
            ],
        )];
        let foreign_spends = [
            foreign_spend(ExitChainOutcome::InternalSeizure(outpoint(10, 0)), 99),
            foreign_spend(ExitChainOutcome::InternalSeizure(outpoint(12, 0)), 98),
        ];

        assert_eq!(
            split_exit_notices(&histories, &foreign_spends),
            notices(
                &[],
                &[],
                &[],
                &[
                    notice_item("tree-coin", 98, outpoint(12, 0)),
                    notice_item("tree-coin", 99, outpoint(10, 0)),
                ],
            )
        );
    }

    #[test]
    fn two_spent_outputs_stay_two_items_when_the_spender_matches() {
        let histories = [history(
            "tree-coin",
            outpoint(1, 0),
            vec![
                hop(10, 0, ExitHopRole::Internal),
                hop(12, 1, ExitHopRole::Internal),
                hop(15, 0, ExitHopRole::Leaf),
            ],
        )];
        let foreign_spends = [
            foreign_spend(ExitChainOutcome::InternalSeizure(outpoint(10, 0)), 99),
            foreign_spend(ExitChainOutcome::InternalSeizure(outpoint(12, 1)), 99),
        ];

        assert_eq!(
            split_exit_notices(&histories, &foreign_spends),
            notices(
                &[],
                &[],
                &[],
                &[
                    notice_item("tree-coin", 99, outpoint(10, 0)),
                    notice_item("tree-coin", 99, outpoint(12, 1)),
                ],
            )
        );
    }

    #[test]
    fn the_last_tree_transaction_is_a_leaf_and_other_non_checkpoint_hops_are_internal_nodes() {
        assert_eq!(hop_role(true, 0, 3), ExitHopRole::Checkpoint);
        assert_eq!(hop_role(false, 0, 3), ExitHopRole::Internal);
        assert_eq!(hop_role(false, 1, 3), ExitHopRole::Internal);
        assert_eq!(hop_role(false, 2, 3), ExitHopRole::Leaf);
        assert_eq!(hop_role(false, 3, 3), ExitHopRole::Internal);
        assert_eq!(hop_role(true, 3, 3), ExitHopRole::Checkpoint);
    }
}
