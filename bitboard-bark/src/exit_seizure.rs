//! Confirmed spends of a chain anchor or a hot checkpoint that are not the next
//! exit transaction. The VTXO outpoint itself is never watched: Bark treats a
//! spend of that output as the user's claim.

use std::collections::{BTreeMap, BTreeSet};

use bitcoin::{OutPoint, Txid};

/// One exit transaction in a VTXO's history, in chain order. The last hop is
/// the VTXO outpoint.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExitHop {
    pub txid: Txid,
    pub output_index: u32,
    pub is_checkpoint: bool,
}

/// Unspent VTXO reduced to the outputs this scan can watch.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VtxoExitHistory {
    pub vtxo_id: String,
    pub anchor: OutPoint,
    pub hops: Vec<ExitHop>,
}

/// Why an output's confirmed foreign spend retires a branch.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum SeizureSource {
    Anchor(OutPoint),
    Checkpoint(Txid),
}

/// An output to ask the chain about, and the only transaction allowed to spend it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WatchedExitOutput {
    pub outpoint: OutPoint,
    pub allowed_spend: Txid,
    pub source: SeizureSource,
}

/// What the chain reported for one watched output. A read error is not a value
/// here: the caller skips that output.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExitOutputSpend {
    Unspent,
    Mempool { spender: Txid },
    Confirmed { spender: Txid },
}

/// Chain anchor, plus each checkpoint output whose next exit transaction is
/// not confirmed. The last hop is the VTXO outpoint and is left out. Shared
/// outputs are listed once.
pub fn watched_exit_outputs(
    histories: &[VtxoExitHistory],
    confirmed_next_hop_txids: &BTreeSet<Txid>,
) -> Vec<WatchedExitOutput> {
    let mut watched_by_outpoint = BTreeMap::<OutPoint, WatchedExitOutput>::new();
    for history in histories {
        for watched in watched_outputs_of_one(history, confirmed_next_hop_txids) {
            watched_by_outpoint
                .entry(watched.outpoint)
                .or_insert(watched);
        }
    }
    watched_by_outpoint.into_values().collect()
}

fn watched_outputs_of_one(
    history: &VtxoExitHistory,
    confirmed_next_hop_txids: &BTreeSet<Txid>,
) -> Vec<WatchedExitOutput> {
    let Some(first_exit) = history.hops.first() else {
        return Vec::new();
    };
    let mut watched = vec![WatchedExitOutput {
        outpoint: history.anchor,
        allowed_spend: first_exit.txid,
        source: SeizureSource::Anchor(history.anchor),
    }];
    for (index, hop) in history.hops.iter().enumerate() {
        let Some(next_hop) = history.hops.get(index + 1) else {
            break;
        };
        if !hop.is_checkpoint {
            continue;
        }
        if confirmed_next_hop_txids.contains(&next_hop.txid) {
            continue;
        }
        watched.push(WatchedExitOutput {
            outpoint: OutPoint {
                txid: hop.txid,
                vout: hop.output_index,
            },
            allowed_spend: next_hop.txid,
            source: SeizureSource::Checkpoint(hop.txid),
        });
    }
    watched
}

/// Confirmed spends whose transaction is not the allowed next exit transaction.
pub fn seizure_sources_from_spends(
    watched: &[WatchedExitOutput],
    spends: &BTreeMap<OutPoint, ExitOutputSpend>,
) -> Vec<SeizureSource> {
    let mut sources = BTreeSet::new();
    for output in watched {
        let Some(ExitOutputSpend::Confirmed { spender }) = spends.get(&output.outpoint) else {
            continue;
        };
        if *spender != output.allowed_spend {
            sources.insert(output.source);
        }
    }
    sources.into_iter().collect()
}

/// Every history that uses a seized anchor, or that contains a seized checkpoint
/// transaction. Order is the VTXO id.
pub fn vtxo_ids_for_seizures(
    histories: &[VtxoExitHistory],
    sources: &[SeizureSource],
) -> Vec<String> {
    let mut ids = BTreeSet::new();
    for source in sources {
        for history in histories {
            if history_matches_source(history, *source) {
                ids.insert(history.vtxo_id.clone());
            }
        }
    }
    ids.into_iter().collect()
}

fn history_matches_source(history: &VtxoExitHistory, source: SeizureSource) -> bool {
    match source {
        SeizureSource::Anchor(anchor) => history.anchor == anchor,
        SeizureSource::Checkpoint(checkpoint_txid) => {
            history.hops.iter().any(|hop| hop.txid == checkpoint_txid)
        }
    }
}

#[cfg(target_arch = "wasm32")]
mod scan {
    use std::cell::RefCell;
    use std::collections::{BTreeMap, BTreeSet};

    use bitcoin::{OutPoint, Txid};

    use super::{
        ExitHop, ExitOutputSpend, VtxoExitHistory, seizure_sources_from_spends,
        vtxo_ids_for_seizures, watched_exit_outputs,
    };

    thread_local! {
        static LAST_SEIZED_VTXO_IDS: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
    }

    pub(crate) fn clear_exit_seizures() {
        LAST_SEIZED_VTXO_IDS.with(|slot| slot.borrow_mut().clear());
    }

    pub(crate) fn exit_seizures_json() -> String {
        LAST_SEIZED_VTXO_IDS
            .with(|slot| serde_json::to_string(&*slot.borrow()).unwrap_or_else(|_| "[]".to_owned()))
    }

    /// Best-effort. A wallet-store failure, or a chain read that does not cover
    /// every watched output, leaves the previous notice in place and does not
    /// mark any VTXO spent. A chain error is not itself a seizure.
    pub(crate) async fn record_exit_chain_seizures(wallet: &bark::Wallet) {
        match seized_vtxo_ids(wallet).await {
            Ok(ids) => remember(ids),
            Err(err) => warn(&format!(
                "Bark could not scan exit outputs for a seizure: {err}"
            )),
        }
    }

    fn remember(ids: Vec<String>) {
        LAST_SEIZED_VTXO_IDS.with(|slot| *slot.borrow_mut() = ids);
    }

    async fn seized_vtxo_ids(wallet: &bark::Wallet) -> Result<Vec<String>, String> {
        let unspent = wallet.vtxos().await.map_err(|err| err.to_string())?;
        let full_vtxos = wallet
            .get_full_vtxos(&unspent)
            .await
            .map_err(|err| err.to_string())?;
        let histories = full_vtxos
            .iter()
            .map(history_from_full_vtxo)
            .collect::<Vec<_>>();
        let confirmed_next_hops = confirmed_next_hop_txids(wallet, &histories).await;
        let watched = watched_exit_outputs(&histories, &confirmed_next_hops);
        let spends = spend_by_outpoint(wallet, &watched).await?;
        let sources = seizure_sources_from_spends(&watched, &spends);
        let ids = vtxo_ids_for_seizures(&histories, &sources);
        if ids.is_empty() {
            return Ok(ids);
        }
        mark_ids_spent(wallet, &unspent, &ids).await?;
        Ok(ids)
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
        let tx_types = crate::emergency_exit::exit_graph_tx_types(
            &continuation_scripts,
            &vtxo.past_arkoor_pubkeys(),
            vtxo.server_pubkey(),
            vtxo.exit_delta(),
            vtxo.expiry_height(),
        );
        let hops = items
            .iter()
            .zip(tx_types)
            .map(|(item, tx_type)| ExitHop {
                txid: item.tx.compute_txid(),
                output_index: item.output_idx as u32,
                is_checkpoint: tx_type == crate::emergency_exit::ExitGraphTxType::Checkpoint,
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
            for (index, hop) in history.hops.iter().enumerate() {
                if !hop.is_checkpoint {
                    continue;
                }
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
pub(crate) use scan::{clear_exit_seizures, exit_seizures_json, record_exit_chain_seizures};

#[cfg(test)]
mod tests {
    use super::{
        ExitHop, ExitOutputSpend, SeizureSource, VtxoExitHistory, seizure_sources_from_spends,
        vtxo_ids_for_seizures, watched_exit_outputs,
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

    fn hop(byte: u8, output_index: u32, is_checkpoint: bool) -> ExitHop {
        ExitHop {
            txid: txid(byte),
            output_index,
            is_checkpoint,
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
            vec![hop(10, 0, false), hop(20, 1, true), hop(30, 0, false)],
        )
    }

    #[test]
    fn an_anchor_or_hot_checkpoint_spent_by_the_next_exit_tx_is_not_a_seizure() {
        let histories = [chain_with_hot_checkpoint()];
        let watched = watched_exit_outputs(&histories, &BTreeSet::new());
        let spends = BTreeMap::from([
            (
                outpoint(1, 0),
                ExitOutputSpend::Confirmed { spender: txid(10) },
            ),
            (
                outpoint(20, 1),
                ExitOutputSpend::Confirmed { spender: txid(30) },
            ),
        ]);

        assert!(seizure_sources_from_spends(&watched, &spends).is_empty());
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
            seizure_sources_from_spends(&watched, &spends),
            vec![SeizureSource::Checkpoint(txid(20))]
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
    fn a_seized_hot_checkpoint_selects_every_vtxo_whose_history_contains_it() {
        let probed = chain_with_hot_checkpoint();
        let locked_sibling = history(
            "locked-sibling",
            outpoint(2, 0),
            vec![hop(20, 1, true), hop(40, 0, false)],
        );
        let unrelated = history("other", outpoint(3, 0), vec![hop(50, 0, false)]);
        let histories = [probed, locked_sibling, unrelated];
        let sources = [SeizureSource::Checkpoint(txid(20))];

        assert_eq!(
            vtxo_ids_for_seizures(&histories, &sources),
            vec!["locked-sibling".to_owned(), "probed".to_owned()]
        );
    }

    #[test]
    fn a_seized_anchor_selects_every_unspent_vtxo_with_that_anchor() {
        let shared = outpoint(1, 0);
        let histories = [
            history("first", shared, vec![hop(10, 0, false)]),
            history("second", shared, vec![hop(11, 0, false)]),
            history("other", outpoint(3, 0), vec![hop(50, 0, false)]),
        ];
        let sources = [SeizureSource::Anchor(shared)];

        assert_eq!(
            vtxo_ids_for_seizures(&histories, &sources),
            vec!["first".to_owned(), "second".to_owned()]
        );
    }

    #[test]
    fn the_vtxo_outpoint_is_not_watched_even_when_it_is_a_checkpoint() {
        let histories = [history(
            "leaf-checkpoint",
            outpoint(1, 0),
            vec![hop(10, 0, false), hop(70, 2, true)],
        )];
        let watched = watched_exit_outputs(&histories, &BTreeSet::new());

        assert_eq!(watched.len(), 1);
        assert_eq!(watched[0].outpoint, outpoint(1, 0));
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

        assert!(seizure_sources_from_spends(&watched, &spends).is_empty());
    }

    #[test]
    fn a_non_checkpoint_hop_is_not_watched() {
        let histories = [history(
            "tree-only",
            outpoint(1, 0),
            vec![hop(10, 0, false), hop(15, 1, false), hop(16, 0, false)],
        )];
        let watched = watched_exit_outputs(&histories, &BTreeSet::new());

        assert_eq!(
            watched
                .iter()
                .map(|output| output.outpoint)
                .collect::<Vec<_>>(),
            vec![outpoint(1, 0)]
        );
    }
}
