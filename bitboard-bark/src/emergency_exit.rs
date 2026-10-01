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
    if !rate_sat_per_vb.is_finite() || rate_sat_per_vb <= 0.0 || rate_sat_per_vb > MAX_FEE_RATE_SAT_PER_VB
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

#[cfg(target_arch = "wasm32")]
mod wasm {
    use std::collections::HashSet;

    use bitcoin::consensus::encode::serialize_hex;
    use bitcoin::Transaction;
    use bitcoin::Txid;
    use wasm_bindgen::prelude::*;

    use super::{
        encode_hex, fee_rate_from_sat_per_vb, fee_rate_sat_per_vb, format_bark_exit_error, json_string,
        zero_estimate_json,
        BarkEmergencyExitStateKind, EmergencyExitCpfpRequestJson, EmergencyExitDrainJson,
        EmergencyExitEstimateJson, EmergencyExitProgressJson, EmergencyExitRowJson,
        BARK_EXIT_ALREADY_EXITED, BARK_EXIT_ALREADY_SPENT, BARK_EXIT_DUST, BARK_EXIT_UNKNOWN_VTXO,
    };
    use crate::exit_address::parse_signet_receive_address;
    use crate::session::{bark_error, finish_wallet_operation, require_session_synced, take_active_wallet};

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
                raw_id.parse::<bark::ark::VtxoId>().map_err(|_| {
                    format_bark_exit_error(BARK_EXIT_UNKNOWN_VTXO, raw_id.trim())
                })
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
            let seen = rows.iter().map(|row| row.vtxo_id.clone()).collect::<HashSet<_>>();
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
            let child_tx = bitcoin::consensus::encode::deserialize_hex::<Transaction>(&child_tx_hex)
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
            let parsed_id = vtxo_id.parse::<bark::ark::VtxoId>().map_err(|_| {
                format_bark_exit_error(BARK_EXIT_UNKNOWN_VTXO, vtxo_id.trim())
            })?;
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
}

#[cfg(test)]
mod tests {
    use super::{
        emergency_exit_state_json, fee_rate_from_sat_per_vb, fee_rate_sat_per_vb,
        BarkEmergencyExitStateKind, BARK_EXIT_ALREADY_EXITED, BARK_EXIT_ALREADY_SPENT,
        BARK_EXIT_DUST, BARK_EXIT_UNKNOWN_VTXO,
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
}
