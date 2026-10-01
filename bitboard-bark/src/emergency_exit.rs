use serde::Serialize;

pub const BARK_EXIT_UNKNOWN_VTXO: &str = "bark_exit_unknown_vtxo";
pub const BARK_EXIT_DUST: &str = "bark_exit_dust";
pub const BARK_EXIT_ALREADY_EXITED: &str = "bark_exit_already_exited";
pub const BARK_EXIT_ALREADY_SPENT: &str = "bark_exit_already_spent";

/// Bark [`bark::exit::ExitStateKind`], named for the control page.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BarkEmergencyExitStateKind {
    Start,
    Processing,
    AwaitingDelta,
    Claimable,
    ClaimInProgress,
    Claimed,
    VtxoAlreadySpent,
    Canceled,
}

impl BarkEmergencyExitStateKind {
    pub const ALL: [BarkEmergencyExitStateKind; 8] = [
        BarkEmergencyExitStateKind::Start,
        BarkEmergencyExitStateKind::Processing,
        BarkEmergencyExitStateKind::AwaitingDelta,
        BarkEmergencyExitStateKind::Claimable,
        BarkEmergencyExitStateKind::ClaimInProgress,
        BarkEmergencyExitStateKind::Claimed,
        BarkEmergencyExitStateKind::VtxoAlreadySpent,
        BarkEmergencyExitStateKind::Canceled,
    ];
}

pub fn emergency_exit_state_json(kind: BarkEmergencyExitStateKind) -> &'static str {
    match kind {
        BarkEmergencyExitStateKind::Start => "start",
        BarkEmergencyExitStateKind::Processing => "processing",
        BarkEmergencyExitStateKind::AwaitingDelta => "awaitingDelta",
        BarkEmergencyExitStateKind::Claimable => "claimable",
        BarkEmergencyExitStateKind::ClaimInProgress => "claimInProgress",
        BarkEmergencyExitStateKind::Claimed => "claimed",
        BarkEmergencyExitStateKind::VtxoAlreadySpent => "vtxoAlreadySpent",
        BarkEmergencyExitStateKind::Canceled => "canceled",
    }
}

pub fn format_bark_exit_error(code: &str, detail: &str) -> String {
    format!("{code}: {detail}")
}

/// Satoshis per virtual byte. Bark's `FeeRate` counts satoshis per 1,000 weight units.
pub fn fee_rate_sat_per_vb(fee_rate: bitcoin::FeeRate) -> f64 {
    fee_rate.to_sat_per_kwu() as f64 / SAT_PER_KWU_PER_SAT_VB
}

const SAT_PER_KWU_PER_SAT_VB: f64 = 250.0;
const MAX_FEE_RATE_SAT_PER_VB: f64 = 1_000_000.0;

/// The app's Signet fee preset, in sat/vB. Bark's own fast rate is not used.
pub fn fee_rate_from_sat_per_vb(rate_sat_per_vb: f64) -> Result<bitcoin::FeeRate, String> {
    if !rate_sat_per_vb.is_finite()
        || rate_sat_per_vb <= 0.0
        || rate_sat_per_vb > MAX_FEE_RATE_SAT_PER_VB
    {
        return Err(
            "bark_exit_fee_rate: Fee rate must be a positive number of satoshis per virtual byte"
                .to_owned(),
        );
    }
    let sat_per_kwu = (rate_sat_per_vb * SAT_PER_KWU_PER_SAT_VB).round();
    if sat_per_kwu <= 0.0 || sat_per_kwu > u64::MAX as f64 {
        return Err("bark_exit_fee_rate: Fee rate is out of range".to_owned());
    }
    Ok(bitcoin::FeeRate::from_sat_per_kwu(sat_per_kwu as u64))
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmergencyExitEstimateJson {
    exit_broadcast_fee_sats: u64,
    claim_fee_sats: u64,
    fee_rate_sat_per_vb: f64,
    txs_to_broadcast: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmergencyExitRowJson {
    vtxo_id: String,
    state: &'static str,
    cancelable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmergencyExitCpfpRequestJson {
    vtxo_id: String,
    parent_txid: String,
    parent_tx_hex: String,
    rbf_min_fee_rate_sat_per_kwu: Option<u64>,
    current_package_fee_sats: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmergencyExitProgressJson {
    requests: Vec<EmergencyExitCpfpRequestJson>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmergencyExitDrainJson {
    psbt_hex: String,
    raw_tx_hex: String,
}

fn json_string(value: &impl Serialize) -> Result<String, String> {
    serde_json::to_string(value).map_err(|err| err.to_string())
}

fn zero_estimate_json(fee_rate_sat_per_vb: f64) -> Result<String, String> {
    json_string(&EmergencyExitEstimateJson {
        exit_broadcast_fee_sats: 0,
        claim_fee_sats: 0,
        fee_rate_sat_per_vb,
        txs_to_broadcast: 0,
    })
}

const EXIT_GRAPH_RANK_PENDING: u8 = 0;
const EXIT_GRAPH_RANK_NEEDS_CHILD: u8 = 1;
const EXIT_GRAPH_RANK_IN_PROGRESS: u8 = 2;
const EXIT_GRAPH_RANK_CONFIRMED: u8 = 3;

/// One exit transaction, before spends are limited to other nodes in the graph.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExitGraphTransaction {
    pub txid: String,
    pub input_txids: Vec<String>,
}

/// How far one VTXO's exit has moved. The transaction list is the genesis chain.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExitGraphChain {
    pub vtxo_id: String,
    pub transactions: Vec<ExitGraphTransaction>,
    pub status: ExitGraphChainStatus,
}

/// Status for every transaction on a chain, or one mark per exit transaction.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ExitGraphChainStatus {
    Pending,
    Confirmed,
    Transactions(Vec<ExitGraphTransactionStatus>),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExitGraphTransactionStatus {
    pub txid: String,
    pub kind: ExitGraphTransactionKind,
    pub waiting_on_txids: Vec<String>,
}

/// Bark's per-transaction exit status, without the Pay-to-Anchor child.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExitGraphTransactionKind {
    Pending,
    WaitingOnInputs,
    NeedsChild,
    InProgress,
    Confirmed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ExitGraphDraft {
    input_txids: Vec<String>,
    leaf_vtxo_ids: Vec<String>,
    rank: u8,
    waiting_on_txids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExitGraphNodeJson {
    txid: String,
    spends: Vec<String>,
    leaf_vtxo_ids: Vec<String>,
    status: &'static str,
    needs_child: bool,
    waiting_on_txids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExitGraphJson {
    nodes: Vec<ExitGraphNodeJson>,
}

pub(crate) fn exit_graph_transaction_from_bitcoin(
    tx: &bitcoin::Transaction,
) -> ExitGraphTransaction {
    ExitGraphTransaction {
        txid: tx.compute_txid().to_string(),
        input_txids: tx
            .input
            .iter()
            .map(|input| input.previous_output.txid.to_string())
            .collect(),
    }
}

/// Merges exit chains into one graph. The last transaction of a chain is that coin's leaf.
/// An input txid that is not itself a node stays off the graph.
pub(crate) fn merge_exit_graph(chains: &[ExitGraphChain]) -> Vec<ExitGraphNodeJson> {
    let mut drafts: std::collections::BTreeMap<String, ExitGraphDraft> =
        std::collections::BTreeMap::new();
    for chain in chains {
        let leaf_txid = chain
            .transactions
            .last()
            .map(|transaction| transaction.txid.clone());
        for transaction in &chain.transactions {
            let draft = drafts
                .entry(transaction.txid.clone())
                .or_insert_with(|| ExitGraphDraft {
                    input_txids: transaction.input_txids.clone(),
                    leaf_vtxo_ids: Vec::new(),
                    rank: EXIT_GRAPH_RANK_PENDING,
                    waiting_on_txids: Vec::new(),
                });
            if leaf_txid.as_ref() == Some(&transaction.txid) {
                push_unique(&mut draft.leaf_vtxo_ids, chain.vtxo_id.clone());
            }
        }
        apply_chain_status(&mut drafts, chain);
    }

    let node_txids: std::collections::BTreeSet<String> = drafts.keys().cloned().collect();
    drafts
        .into_iter()
        .map(|(txid, draft)| {
            let mut spends: Vec<String> = draft
                .input_txids
                .into_iter()
                .filter(|input_txid| node_txids.contains(input_txid))
                .collect();
            spends = sorted_unique(spends);
            let mut leaf_vtxo_ids = draft.leaf_vtxo_ids;
            leaf_vtxo_ids.sort();
            let waiting_on_txids = if draft.rank == EXIT_GRAPH_RANK_PENDING {
                sorted_unique(draft.waiting_on_txids)
            } else {
                Vec::new()
            };
            ExitGraphNodeJson {
                txid,
                spends,
                leaf_vtxo_ids,
                status: exit_graph_status_label(draft.rank),
                needs_child: draft.rank == EXIT_GRAPH_RANK_NEEDS_CHILD,
                waiting_on_txids,
            }
        })
        .collect()
}

fn apply_chain_status(
    drafts: &mut std::collections::BTreeMap<String, ExitGraphDraft>,
    chain: &ExitGraphChain,
) {
    match &chain.status {
        ExitGraphChainStatus::Pending => {
            for transaction in &chain.transactions {
                note_transaction_status(
                    drafts,
                    &ExitGraphTransactionStatus {
                        txid: transaction.txid.clone(),
                        kind: ExitGraphTransactionKind::Pending,
                        waiting_on_txids: Vec::new(),
                    },
                );
            }
        }
        ExitGraphChainStatus::Confirmed => {
            for transaction in &chain.transactions {
                note_transaction_status(
                    drafts,
                    &ExitGraphTransactionStatus {
                        txid: transaction.txid.clone(),
                        kind: ExitGraphTransactionKind::Confirmed,
                        waiting_on_txids: Vec::new(),
                    },
                );
            }
        }
        ExitGraphChainStatus::Transactions(marks) => {
            for mark in marks {
                note_transaction_status(drafts, mark);
            }
        }
    }
}

fn note_transaction_status(
    drafts: &mut std::collections::BTreeMap<String, ExitGraphDraft>,
    mark: &ExitGraphTransactionStatus,
) {
    let Some(draft) = drafts.get_mut(&mark.txid) else {
        return;
    };
    let incoming_rank = exit_graph_rank(mark.kind);
    if incoming_rank > draft.rank {
        draft.rank = incoming_rank;
        draft.waiting_on_txids = if mark.kind == ExitGraphTransactionKind::WaitingOnInputs {
            mark.waiting_on_txids.clone()
        } else {
            Vec::new()
        };
        return;
    }
    if incoming_rank == draft.rank && mark.kind == ExitGraphTransactionKind::WaitingOnInputs {
        draft.waiting_on_txids.extend(mark.waiting_on_txids.clone());
    }
}

fn exit_graph_rank(kind: ExitGraphTransactionKind) -> u8 {
    match kind {
        ExitGraphTransactionKind::Pending | ExitGraphTransactionKind::WaitingOnInputs => {
            EXIT_GRAPH_RANK_PENDING
        }
        ExitGraphTransactionKind::NeedsChild => EXIT_GRAPH_RANK_NEEDS_CHILD,
        ExitGraphTransactionKind::InProgress => EXIT_GRAPH_RANK_IN_PROGRESS,
        ExitGraphTransactionKind::Confirmed => EXIT_GRAPH_RANK_CONFIRMED,
    }
}

fn exit_graph_status_label(rank: u8) -> &'static str {
    if rank == EXIT_GRAPH_RANK_CONFIRMED {
        "confirmed"
    } else if rank == EXIT_GRAPH_RANK_NEEDS_CHILD || rank == EXIT_GRAPH_RANK_IN_PROGRESS {
        "inProgress"
    } else {
        "pending"
    }
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.contains(&value) {
        values.push(value);
    }
}

fn sorted_unique(mut values: Vec<String>) -> Vec<String> {
    values.sort();
    values.dedup();
    values
}

fn exit_graph_json(nodes: Vec<ExitGraphNodeJson>) -> Result<String, String> {
    json_string(&ExitGraphJson { nodes })
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use std::collections::HashSet;

    use bitcoin::Transaction;
    use bitcoin::Txid;
    use bitcoin::consensus::encode::serialize_hex;
    use wasm_bindgen::prelude::*;

    use super::{
        BARK_EXIT_ALREADY_EXITED, BARK_EXIT_ALREADY_SPENT, BARK_EXIT_DUST, BARK_EXIT_UNKNOWN_VTXO,
        BarkEmergencyExitStateKind, EmergencyExitCpfpRequestJson, EmergencyExitDrainJson,
        EmergencyExitEstimateJson, EmergencyExitProgressJson, EmergencyExitRowJson, encode_hex,
        fee_rate_from_sat_per_vb, fee_rate_sat_per_vb, format_bark_exit_error, json_string,
        zero_estimate_json,
    };
    use crate::exit_address::parse_signet_receive_address;
    use crate::session::{
        bark_error, finish_wallet_operation, require_session_synced, take_active_wallet,
    };

    fn format_exit_error(err: &bark::exit::ExitError) -> String {
        let code = match err {
            bark::exit::ExitError::UnknownVtxo { .. } => BARK_EXIT_UNKNOWN_VTXO,
            bark::exit::ExitError::DustLimit { .. } => BARK_EXIT_DUST,
            bark::exit::ExitError::VtxoAlreadyExited { .. } => BARK_EXIT_ALREADY_EXITED,
            bark::exit::ExitError::VtxoAlreadySpent { .. } => BARK_EXIT_ALREADY_SPENT,
            bark::exit::ExitError::CannotCancelExit { .. } => "bark_exit_cannot_cancel",
            bark::exit::ExitError::NotExiting { .. } => "bark_exit_not_exiting",
            bark::exit::ExitError::ExitTxAlreadyBroadcast { .. } => "bark_exit_already_broadcast",
            bark::exit::ExitError::InsufficientConfirmedFunds { .. } => {
                "bark_exit_insufficient_funds"
            }
            bark::exit::ExitError::ClaimFeeExceedsOutput { .. } => "bark_exit_claim_fee",
            bark::exit::ExitError::ClaimMissingInputs => "bark_exit_claim_missing_inputs",
            bark::exit::ExitError::VtxoNotClaimable { .. } => "bark_exit_not_claimable",
            _ => "bark_exit_failed",
        };
        format_bark_exit_error(code, &err.to_string())
    }

    fn map_exit_error<T>(result: Result<T, bark::exit::ExitError>) -> Result<T, String> {
        result.map_err(|err| format_exit_error(&err))
    }

    fn map_anyhow_exit<T, E: std::fmt::Display>(result: Result<T, E>) -> Result<T, String> {
        result.map_err(bark_error)
    }

    fn parse_vtxo_ids(vtxo_ids_json: &str) -> Result<Vec<bark::ark::VtxoId>, String> {
        let raw_ids: Vec<String> = serde_json::from_str(vtxo_ids_json)
            .map_err(|_| "Bark emergency exit VTXO list was not JSON".to_owned())?;
        raw_ids
            .into_iter()
            .map(|raw_id| {
                raw_id
                    .parse::<bark::ark::VtxoId>()
                    .map_err(|_| format_bark_exit_error(BARK_EXIT_UNKNOWN_VTXO, raw_id.trim()))
            })
            .collect()
    }

    fn kind_from_bark(kind: bark::exit::ExitStateKind) -> BarkEmergencyExitStateKind {
        match kind {
            bark::exit::ExitStateKind::Start => BarkEmergencyExitStateKind::Start,
            bark::exit::ExitStateKind::Processing => BarkEmergencyExitStateKind::Processing,
            bark::exit::ExitStateKind::AwaitingDelta => BarkEmergencyExitStateKind::AwaitingDelta,
            bark::exit::ExitStateKind::Claimable => BarkEmergencyExitStateKind::Claimable,
            bark::exit::ExitStateKind::ClaimInProgress => {
                BarkEmergencyExitStateKind::ClaimInProgress
            }
            bark::exit::ExitStateKind::Claimed => BarkEmergencyExitStateKind::Claimed,
            bark::exit::ExitStateKind::VtxoAlreadySpent => {
                BarkEmergencyExitStateKind::VtxoAlreadySpent
            }
            bark::exit::ExitStateKind::Canceled => BarkEmergencyExitStateKind::Canceled,
        }
    }

    fn row_from_state(vtxo_id: String, state: &bark::exit::ExitState) -> EmergencyExitRowJson {
        let kind = kind_from_bark(state.kind());
        EmergencyExitRowJson {
            vtxo_id,
            state: super::emergency_exit_state_json(kind),
            cancelable: state.is_cancelable(),
        }
    }

    async fn unspent_vtxo_ids(wallet: &bark::Wallet) -> Result<Vec<bark::ark::VtxoId>, String> {
        let vtxos = wallet.vtxos().await.map_err(bark_error)?;
        Ok(vtxos.into_iter().map(|vtxo| vtxo.id()).collect())
    }

    async fn run_with_synced_wallet<T, F>(operation: F) -> Result<T, JsValue>
    where
        F: AsyncFnOnce(&bark::Wallet) -> Result<T, String>,
    {
        require_session_synced().map_err(|err| JsValue::from_str(&err))?;
        let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
        let operation_result = operation(&wallet).await;
        finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
    }

    /// Broadcast fee, later claim fee, and how many exit transactions still need a child.
    /// An empty id list estimates every unspent VTXO. `fundable` is ignored.
    /// `fee_rate_sat_per_vb` prices both the broadcast and the claim.
    #[wasm_bindgen]
    pub async fn bark_estimate_emergency_exit(
        vtxo_ids_json: String,
        requested_fee_rate_sat_per_vb: f64,
    ) -> Result<String, JsValue> {
        run_with_synced_wallet(async |wallet| {
            let fee_rate = fee_rate_from_sat_per_vb(requested_fee_rate_sat_per_vb)?;
            let requested = parse_vtxo_ids(&vtxo_ids_json)?;
            let vtxo_ids = if requested.is_empty() {
                unspent_vtxo_ids(wallet).await?
            } else {
                requested
            };
            if vtxo_ids.is_empty() {
                return zero_estimate_json(fee_rate_sat_per_vb(fee_rate));
            }
            let estimate = map_exit_error(
                wallet
                    .exit_mgr()
                    .estimate_emergency_exit_fee(&vtxo_ids, wallet, Some(fee_rate), None)
                    .await,
            )?;
            json_string(&EmergencyExitEstimateJson {
                exit_broadcast_fee_sats: estimate.exit_broadcast_fee.to_sat(),
                claim_fee_sats: estimate.claim_fee.to_sat(),
                fee_rate_sat_per_vb: fee_rate_sat_per_vb(estimate.fee_rate),
                txs_to_broadcast: estimate.txs_to_broadcast as u64,
            })
        })
        .await
    }

    /// Empty id list starts an exit for the whole wallet. Does not offboard.
    #[wasm_bindgen]
    pub async fn bark_start_emergency_exit(vtxo_ids_json: String) -> Result<(), JsValue> {
        run_with_synced_wallet(async |wallet| {
            let requested = parse_vtxo_ids(&vtxo_ids_json)?;
            if requested.is_empty() {
                return map_anyhow_exit(wallet.exit_mgr().start_exit_for_entire_wallet().await);
            }
            let mut selected_vtxos = Vec::with_capacity(requested.len());
            for vtxo_id in &requested {
                match wallet.get_vtxo_by_id(*vtxo_id).await {
                    Ok(wallet_vtxo) => selected_vtxos.push(wallet_vtxo.vtxo),
                    Err(_) => {
                        return Err(format_bark_exit_error(
                            BARK_EXIT_UNKNOWN_VTXO,
                            &vtxo_id.to_string(),
                        ));
                    }
                }
            }
            map_anyhow_exit(
                wallet
                    .exit_mgr()
                    .start_exit_for_vtxos(&selected_vtxos)
                    .await,
            )
        })
        .await
    }

    /// Live exit rows. Does not progress them and does not require a fresh sync.
    #[wasm_bindgen]
    pub async fn bark_list_emergency_exits() -> Result<String, JsValue> {
        let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
        let operation_result = async {
            let live = map_anyhow_exit(wallet.exit_mgr().list_live(false, false).await)?;
            let mut rows = live
                .iter()
                .map(|status| row_from_state(status.vtxo_id.to_string(), &status.state))
                .collect::<Vec<_>>();
            let seen = rows
                .iter()
                .map(|row| row.vtxo_id.clone())
                .collect::<HashSet<_>>();
            for claimable in wallet.exit_mgr().list_claimable().await {
                let vtxo_id = claimable.id().to_string();
                if seen.contains(&vtxo_id) {
                    continue;
                }
                rows.push(row_from_state(vtxo_id, claimable.state()));
            }
            json_string(&rows)
        }
        .await;
        finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
    }

    /// `Exit::progress_exits` only. Returns Pay-to-Anchor parents that still need a child.
    /// Does not call `Wallet::progress_exits`.
    #[wasm_bindgen]
    pub async fn bark_progress_emergency_exits() -> Result<String, JsValue> {
        run_with_synced_wallet(async |wallet| {
            map_anyhow_exit(wallet.exit_mgr().progress_exits(wallet).await)?;
            let mut seen_txids = HashSet::new();
            let mut requests = Vec::new();
            for request in wallet.exit_mgr().exits_needing_cpfp().await {
                let parent_txid = request.exit_tx.compute_txid();
                if !seen_txids.insert(parent_txid) {
                    continue;
                }
                let (rbf_min_fee_rate_sat_per_kwu, current_package_fee_sats) =
                    match request.rbf_requirement {
                        Some(requirement) => (
                            Some(requirement.min_fee_rate.to_sat_per_kwu()),
                            Some(requirement.current_package_fee.to_sat()),
                        ),
                        None => (None, None),
                    };
                requests.push(EmergencyExitCpfpRequestJson {
                    vtxo_id: request.vtxo_id.to_string(),
                    parent_txid: parent_txid.to_string(),
                    parent_tx_hex: serialize_hex(&request.exit_tx),
                    rbf_min_fee_rate_sat_per_kwu,
                    current_package_fee_sats,
                });
            }
            json_string(&EmergencyExitProgressJson { requests })
        })
        .await
    }

    /// Bark broadcasts the parent and this signed child.
    #[wasm_bindgen]
    pub async fn bark_provide_emergency_exit_cpfp(
        exit_txid: String,
        child_tx_hex: String,
    ) -> Result<(), JsValue> {
        run_with_synced_wallet(async |wallet| {
            let parent_txid = exit_txid
                .parse::<Txid>()
                .map_err(|_| "Bark emergency exit transaction id is invalid".to_owned())?;
            let child_tx = bitcoin::consensus::encode::deserialize_hex::<Transaction>(
                &child_tx_hex,
            )
            .map_err(|err| format!("Bark emergency exit child transaction is invalid: {err}"))?;
            map_exit_error(
                wallet
                    .exit_mgr()
                    .provide_cpfp_tx(wallet, parent_txid, child_tx)
                    .await,
            )
        })
        .await
    }

    #[wasm_bindgen]
    pub async fn bark_cancel_emergency_exit(vtxo_id: String) -> Result<(), JsValue> {
        run_with_synced_wallet(async |wallet| {
            let parsed_id = vtxo_id
                .parse::<bark::ark::VtxoId>()
                .map_err(|_| format_bark_exit_error(BARK_EXIT_UNKNOWN_VTXO, vtxo_id.trim()))?;
            map_exit_error(wallet.exit_mgr().cancel_exit(parsed_id).await)
        })
        .await
    }

    /// Signed claim PSBT and the extracted transaction. The worker does not broadcast it.
    /// `fee_rate_sat_per_vb` is the claim fee override.
    #[wasm_bindgen]
    pub async fn bark_drain_emergency_exits(
        address: String,
        requested_fee_rate_sat_per_vb: f64,
    ) -> Result<String, JsValue> {
        run_with_synced_wallet(async |wallet| {
            let fee_rate = fee_rate_from_sat_per_vb(requested_fee_rate_sat_per_vb)?;
            let destination = parse_signet_receive_address(&address)?;
            let claimable = wallet.exit_mgr().list_claimable().await;
            let psbt = map_exit_error(
                wallet
                    .exit_mgr()
                    .drain_exits(&claimable, wallet, destination, Some(fee_rate))
                    .await,
            )?;
            let raw_tx = psbt.clone().extract_tx().map_err(|err| {
                format_bark_exit_error("bark_exit_claim_extract", &err.to_string())
            })?;
            json_string(&EmergencyExitDrainJson {
                psbt_hex: encode_hex(&psbt.serialize()),
                raw_tx_hex: serialize_hex(&raw_tx),
            })
        })
        .await
    }

    /// Exit-transaction graph for the given VTXO ids. An empty list returns no nodes.
    /// Does not progress exits and does not require a fresh sync.
    #[wasm_bindgen]
    pub async fn bark_exit_topology(vtxo_ids_json: String) -> Result<String, JsValue> {
        let requested = parse_vtxo_ids(&vtxo_ids_json).map_err(|err| JsValue::from_str(&err))?;
        if requested.is_empty() {
            return super::exit_graph_json(Vec::new()).map_err(|err| JsValue::from_str(&err));
        }
        let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
        let operation_result = async {
            let mut chains = Vec::with_capacity(requested.len());
            for vtxo_id in requested {
                let full_vtxo = match wallet.get_full_vtxo(vtxo_id).await {
                    Ok(vtxo) => vtxo,
                    Err(_) => {
                        return Err(format_bark_exit_error(
                            BARK_EXIT_UNKNOWN_VTXO,
                            &vtxo_id.to_string(),
                        ));
                    }
                };
                let transactions = full_vtxo
                    .transactions()
                    .map(|item| super::exit_graph_transaction_from_bitcoin(&item.tx))
                    .collect();
                let exit_status = map_anyhow_exit(
                    wallet
                        .exit_mgr()
                        .get_exit_status(vtxo_id, false, false)
                        .await,
                )?;
                let status = match exit_status {
                    Some(status) => chain_status_from_exit_state(&status.state),
                    None => super::ExitGraphChainStatus::Pending,
                };
                chains.push(super::ExitGraphChain {
                    vtxo_id: vtxo_id.to_string(),
                    transactions,
                    status,
                });
            }
            super::exit_graph_json(super::merge_exit_graph(&chains))
        }
        .await;
        finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
    }

    fn chain_status_from_exit_state(state: &bark::exit::ExitState) -> super::ExitGraphChainStatus {
        if state.warrants_exited_vtxo() {
            return super::ExitGraphChainStatus::Confirmed;
        }
        match state {
            bark::exit::ExitState::Processing(processing) => {
                super::ExitGraphChainStatus::Transactions(
                    processing
                        .transactions
                        .iter()
                        .map(|exit_tx| {
                            let (kind, waiting_on_txids) =
                                kind_from_exit_tx_status(&exit_tx.status);
                            super::ExitGraphTransactionStatus {
                                txid: exit_tx.txid.to_string(),
                                kind,
                                waiting_on_txids,
                            }
                        })
                        .collect(),
                )
            }
            _ => super::ExitGraphChainStatus::Pending,
        }
    }

    fn kind_from_exit_tx_status(
        status: &bark::exit::ExitTxStatus,
    ) -> (super::ExitGraphTransactionKind, Vec<String>) {
        match status {
            bark::exit::ExitTxStatus::VerifyInputs => {
                (super::ExitGraphTransactionKind::Pending, Vec::new())
            }
            bark::exit::ExitTxStatus::AwaitingInputConfirmation { txids } => (
                super::ExitGraphTransactionKind::WaitingOnInputs,
                txids.iter().map(|txid| txid.to_string()).collect(),
            ),
            bark::exit::ExitTxStatus::AwaitingCpfpBroadcast => {
                (super::ExitGraphTransactionKind::NeedsChild, Vec::new())
            }
            bark::exit::ExitTxStatus::AwaitingConfirmation { .. } => {
                (super::ExitGraphTransactionKind::InProgress, Vec::new())
            }
            bark::exit::ExitTxStatus::Confirmed { .. } => {
                (super::ExitGraphTransactionKind::Confirmed, Vec::new())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        BARK_EXIT_ALREADY_EXITED, BARK_EXIT_ALREADY_SPENT, BARK_EXIT_DUST, BARK_EXIT_UNKNOWN_VTXO,
        BarkEmergencyExitStateKind, ExitGraphChain, ExitGraphChainStatus, ExitGraphTransactionKind,
        ExitGraphTransactionStatus, emergency_exit_state_json, exit_graph_transaction_from_bitcoin,
        fee_rate_from_sat_per_vb, fee_rate_sat_per_vb, merge_exit_graph,
    };
    use crate::exit_address::parse_signet_receive_address;

    const MAINNET_ADDRESS: &str = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

    #[test]
    fn emergency_exit_state_json_covers_each_kind() {
        let labels = BarkEmergencyExitStateKind::ALL.map(emergency_exit_state_json);
        assert_eq!(
            labels,
            [
                "start",
                "processing",
                "awaitingDelta",
                "claimable",
                "claimInProgress",
                "claimed",
                "vtxoAlreadySpent",
                "canceled",
            ]
        );
    }

    #[test]
    fn emergency_exit_error_codes_stay_stable() {
        assert_eq!(BARK_EXIT_UNKNOWN_VTXO, "bark_exit_unknown_vtxo");
        assert_eq!(BARK_EXIT_DUST, "bark_exit_dust");
        assert_eq!(BARK_EXIT_ALREADY_EXITED, "bark_exit_already_exited");
        assert_eq!(BARK_EXIT_ALREADY_SPENT, "bark_exit_already_spent");
    }

    #[test]
    fn emergency_exit_fee_rate_round_trips_one_sat_per_vb() {
        let fee_rate = fee_rate_from_sat_per_vb(1.0).expect("1 sat/vB");
        assert_eq!(fee_rate_sat_per_vb(fee_rate), 1.0);
        assert!(fee_rate_from_sat_per_vb(0.0).is_err());
        assert!(fee_rate_from_sat_per_vb(f64::NAN).is_err());
    }

    #[test]
    fn emergency_drain_rejects_a_non_signet_address() {
        let error = parse_signet_receive_address(MAINNET_ADDRESS).expect_err("mainnet");
        assert_eq!(error, "Bark exit address is not a Signet address");
    }

    fn outside_txid(byte: u8) -> bitcoin::Txid {
        use bitcoin::hashes::Hash;
        bitcoin::Txid::from_byte_array([byte; 32])
    }

    fn transaction_spending(previous_txids: &[bitcoin::Txid]) -> bitcoin::Transaction {
        bitcoin::Transaction {
            version: bitcoin::transaction::Version::TWO,
            lock_time: bitcoin::absolute::LockTime::ZERO,
            input: previous_txids
                .iter()
                .map(|txid| bitcoin::TxIn {
                    previous_output: bitcoin::OutPoint {
                        txid: *txid,
                        vout: 0,
                    },
                    script_sig: bitcoin::ScriptBuf::new(),
                    sequence: bitcoin::Sequence::MAX,
                    witness: bitcoin::Witness::new(),
                })
                .collect(),
            output: vec![bitcoin::TxOut {
                value: bitcoin::Amount::from_sat(10_000),
                script_pubkey: bitcoin::ScriptBuf::new(),
            }],
        }
    }

    fn chain_from_transactions(
        vtxo_id: &str,
        transactions: &[bitcoin::Transaction],
        status: ExitGraphChainStatus,
    ) -> ExitGraphChain {
        ExitGraphChain {
            vtxo_id: vtxo_id.to_owned(),
            transactions: transactions
                .iter()
                .map(exit_graph_transaction_from_bitcoin)
                .collect(),
            status,
        }
    }

    #[test]
    fn exit_graph_drops_an_input_outside_the_chain_and_keeps_the_leaf() {
        let outside = outside_txid(9);
        let parent = transaction_spending(&[outside]);
        let leaf = transaction_spending(&[parent.compute_txid()]);
        let nodes = merge_exit_graph(&[chain_from_transactions(
            "vtxo-a",
            &[parent.clone(), leaf.clone()],
            ExitGraphChainStatus::Pending,
        )]);

        assert_eq!(nodes.len(), 2);
        assert!(nodes.iter().all(|node| node.txid != outside.to_string()));
        let parent_node = nodes
            .iter()
            .find(|node| node.txid == parent.compute_txid().to_string())
            .expect("parent");
        let leaf_node = nodes
            .iter()
            .find(|node| node.txid == leaf.compute_txid().to_string())
            .expect("leaf");
        assert!(parent_node.spends.is_empty());
        assert_eq!(parent_node.leaf_vtxo_ids, Vec::<String>::new());
        assert_eq!(leaf_node.spends, vec![parent.compute_txid().to_string()]);
        assert_eq!(leaf_node.leaf_vtxo_ids, vec!["vtxo-a".to_owned()]);
    }

    #[test]
    fn exit_graph_merges_a_shared_ancestor_into_one_node() {
        let outside = outside_txid(8);
        let parent = transaction_spending(&[outside]);
        let leaf_a = transaction_spending(&[parent.compute_txid()]);
        let mut leaf_b_tx = transaction_spending(&[parent.compute_txid()]);
        leaf_b_tx.output[0].value = bitcoin::Amount::from_sat(20_000);
        let nodes = merge_exit_graph(&[
            chain_from_transactions(
                "vtxo-a",
                &[parent.clone(), leaf_a.clone()],
                ExitGraphChainStatus::Pending,
            ),
            chain_from_transactions(
                "vtxo-b",
                &[parent.clone(), leaf_b_tx.clone()],
                ExitGraphChainStatus::Pending,
            ),
        ]);

        let parent_nodes: Vec<_> = nodes
            .iter()
            .filter(|node| node.txid == parent.compute_txid().to_string())
            .collect();
        assert_eq!(parent_nodes.len(), 1);
        assert_eq!(nodes.len(), 3);
    }

    #[test]
    fn exit_graph_needs_child_does_not_add_a_child_node() {
        let outside = outside_txid(7);
        let exit_tx = transaction_spending(&[outside]);
        let exit_txid = exit_tx.compute_txid().to_string();
        let nodes = merge_exit_graph(&[chain_from_transactions(
            "vtxo-a",
            &[exit_tx],
            ExitGraphChainStatus::Transactions(vec![ExitGraphTransactionStatus {
                txid: exit_txid.clone(),
                kind: ExitGraphTransactionKind::NeedsChild,
                waiting_on_txids: Vec::new(),
            }]),
        )]);

        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].txid, exit_txid);
        assert!(nodes[0].needs_child);
        assert_eq!(nodes[0].status, "inProgress");
        assert!(nodes[0].spends.is_empty());
    }

    #[test]
    fn exit_graph_confirmed_rank_beats_pending_on_a_shared_txid() {
        let outside = outside_txid(6);
        let shared = transaction_spending(&[outside]);
        let shared_txid = shared.compute_txid().to_string();
        let nodes = merge_exit_graph(&[
            chain_from_transactions("vtxo-a", &[shared.clone()], ExitGraphChainStatus::Pending),
            chain_from_transactions(
                "vtxo-b",
                &[shared],
                ExitGraphChainStatus::Transactions(vec![ExitGraphTransactionStatus {
                    txid: shared_txid.clone(),
                    kind: ExitGraphTransactionKind::Confirmed,
                    waiting_on_txids: Vec::new(),
                }]),
            ),
        ]);

        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].status, "confirmed");
        assert!(!nodes[0].needs_child);
        assert!(nodes[0].waiting_on_txids.is_empty());
        assert_eq!(
            nodes[0].leaf_vtxo_ids,
            vec!["vtxo-a".to_owned(), "vtxo-b".to_owned()]
        );
    }
}
