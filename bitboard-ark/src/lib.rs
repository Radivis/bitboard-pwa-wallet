mod api_types;
mod balance_display;
mod error;
mod esplora_blockchain;
mod network;
mod persistence;
mod session;
#[cfg(target_arch = "wasm32")]
mod wasm_sleep;

#[cfg(test)]
mod persistence_tests;

use std::cell::RefCell;
use std::rc::Rc;

use serde::Deserialize;
use wasm_bindgen::prelude::*;

use crate::api_types::{
    CollaborativeExitParams, CompleteUnilateralExitParams, SendPaymentParams,
    UnilateralExitFeeParams,
};
use crate::error::{ArkResult, map_js_error};
use crate::network::NetworkMode;
use crate::session::ArkSession;

const MSG_SESSION_NOT_OPEN: &str = "Arkade session is not open";
const MSG_SESSION_ALREADY_BORROWED: &str =
    "Arkade session is already borrowed — likely a previous operation panicked";

thread_local! {
    static ACTIVE_SESSION: RefCell<Option<Rc<ArkSession>>> = const { RefCell::new(None) };
    static RESET_V1_LOGGED: RefCell<bool> = const { RefCell::new(false) };
}

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

fn active_session_rc() -> ArkResult<Rc<ArkSession>> {
    ACTIVE_SESSION.with(|session_cell| {
        let session_borrow = session_cell.try_borrow().map_err(|_| {
            crate::error::ArkWasmError::Message(MSG_SESSION_ALREADY_BORROWED.into())
        })?;
        session_borrow
            .clone()
            .ok_or_else(|| crate::error::ArkWasmError::Message(MSG_SESSION_NOT_OPEN.into()))
    })
}

fn with_session<F, R>(callback: F) -> ArkResult<R>
where
    F: FnOnce(&ArkSession) -> ArkResult<R>,
{
    let session = active_session_rc()?;
    callback(session.as_ref())
}

fn clear_active_session() -> ArkResult<()> {
    ACTIVE_SESSION.with(|session_cell| {
        let mut session_borrow_mut = session_cell.try_borrow_mut().map_err(|_| {
            crate::error::ArkWasmError::Message(MSG_SESSION_ALREADY_BORROWED.into())
        })?;
        session_borrow_mut.take();
        Ok(())
    })
}

fn log_persistence_v1_reset_once() {
    RESET_V1_LOGGED.with(|logged| {
        if *logged.borrow() {
            return;
        }
        *logged.borrow_mut() = true;
        #[cfg(target_arch = "wasm32")]
        web_sys::console::log_1(
            &"Arkade state reset after SDK migration (persistence v1 ignored)".into(),
        );
        #[cfg(not(target_arch = "wasm32"))]
        eprintln!("Arkade state reset after SDK migration (persistence v1 ignored)");
    });
}

fn to_js_value<T: serde::Serialize>(value: T) -> ArkResult<JsValue> {
    Ok(serde_wasm_bindgen::to_value(&value)?)
}

async fn map_js_async<T>(future: impl Future<Output = ArkResult<T>>) -> Result<T, JsValue> {
    map_js_error(future.await)
}

#[derive(Deserialize)]
struct OpenSessionParams {
    mnemonic: String,
    #[serde(rename = "networkMode")]
    network_mode: String,
    #[serde(rename = "arkServerUrl")]
    ark_server_url: String,
    #[serde(rename = "delegatorUrl")]
    delegator_url: String,
    #[serde(rename = "esploraUrl")]
    esplora_url: String,
    #[serde(rename = "sdkPersistenceJson", default)]
    sdk_persistence_json: Option<String>,
}

#[wasm_bindgen]
pub async fn ark_open_session(params: JsValue) -> Result<JsValue, JsValue> {
    map_js_async(async {
        let params: OpenSessionParams = serde_wasm_bindgen::from_value(params)?;
        let network_mode = NetworkMode::parse(&params.network_mode).ok_or_else(|| {
            crate::error::ArkWasmError::Message(format!(
                "unsupported network mode: {}",
                params.network_mode
            ))
        })?;

        let (session, reset_v1) = ArkSession::open(
            &params.mnemonic,
            network_mode,
            params.ark_server_url,
            params.delegator_url,
            params.esplora_url,
            params.sdk_persistence_json.as_deref(),
        )
        .await?;

        if reset_v1 {
            log_persistence_v1_reset_once();
        }

        let arkade_address = session.offchain_address()?;
        ACTIVE_SESSION.with(|session_cell| -> ArkResult<()> {
            let mut session_borrow_mut = session_cell.try_borrow_mut().map_err(|_| {
                crate::error::ArkWasmError::Message(MSG_SESSION_ALREADY_BORROWED.into())
            })?;
            *session_borrow_mut = Some(Rc::new(session));
            Ok(())
        })?;

        to_js_value(crate::api_types::OpenSessionResult { arkade_address })
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_close_session() -> Result<(), JsValue> {
    map_js_async(async {
        let _ = ark_export_persistence_json_internal();
        clear_active_session()?;
        Ok(())
    })
    .await
}

#[wasm_bindgen]
pub fn ark_export_persistence_json() -> Result<String, JsValue> {
    map_js_error(ark_export_persistence_json_internal())
}

fn ark_export_persistence_json_internal() -> ArkResult<String> {
    with_session(|session| session.export_persistence())
}

#[wasm_bindgen]
pub async fn ark_get_balance() -> Result<JsValue, JsValue> {
    map_js_async(async {
        let session = active_session_rc()?;
        to_js_value(session.balance().await?)
    })
    .await
}

#[wasm_bindgen]
pub fn ark_get_address() -> Result<String, JsValue> {
    map_js_error(with_session(|session| session.offchain_address()))
}

#[wasm_bindgen]
pub fn ark_get_boarding_address() -> Result<String, JsValue> {
    map_js_error(with_session(|session| session.boarding_address()))
}

#[wasm_bindgen]
pub async fn ark_get_boarding_status() -> Result<JsValue, JsValue> {
    map_js_async(async { to_js_value(active_session_rc()?.boarding_status().await?) }).await
}

#[wasm_bindgen]
pub async fn ark_send_payment(params: JsValue) -> Result<String, JsValue> {
    map_js_async(async {
        let params: SendPaymentParams = serde_wasm_bindgen::from_value(params)?;
        active_session_rc()?.send_payment(params).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_get_transaction_history() -> Result<JsValue, JsValue> {
    map_js_async(async { to_js_value(active_session_rc()?.transaction_history().await?) }).await
}

#[wasm_bindgen]
pub async fn ark_get_delegate_info() -> Result<JsValue, JsValue> {
    map_js_async(async { to_js_value(active_session_rc()?.delegate_info().await?) }).await
}

#[wasm_bindgen]
pub async fn ark_get_expiring_vtxo_count() -> Result<u32, JsValue> {
    map_js_async(async { active_session_rc()?.expiring_vtxo_count().await }).await
}

#[wasm_bindgen]
pub async fn ark_renew_vtxos_now() -> Result<Option<String>, JsValue> {
    map_js_async(async { active_session_rc()?.renew_vtxos_now().await }).await
}

#[wasm_bindgen]
pub async fn ark_delegate_spendable_vtxos() -> Result<JsValue, JsValue> {
    map_js_async(async { to_js_value(active_session_rc()?.delegate_spendable_vtxos().await?) })
        .await
}

#[wasm_bindgen]
pub async fn ark_finalize_pending_transactions() -> Result<JsValue, JsValue> {
    map_js_async(async { to_js_value(active_session_rc()?.finalize_pending_transactions().await?) })
        .await
}

#[wasm_bindgen]
pub async fn ark_onboard_boarded_utxos() -> Result<Option<String>, JsValue> {
    map_js_async(async { active_session_rc()?.onboard_boarded_utxos().await }).await
}

#[wasm_bindgen]
pub async fn ark_list_exit_candidates() -> Result<JsValue, JsValue> {
    map_js_async(async { to_js_value(active_session_rc()?.list_exit_candidates().await?) }).await
}

#[wasm_bindgen]
pub async fn ark_get_onchain_bumper_info() -> Result<JsValue, JsValue> {
    map_js_async(async { to_js_value(active_session_rc()?.onchain_bumper_info().await?) }).await
}

#[wasm_bindgen]
pub async fn ark_collaborative_exit(params: JsValue) -> Result<String, JsValue> {
    map_js_async(async {
        let params: CollaborativeExitParams = serde_wasm_bindgen::from_value(params)?;
        active_session_rc()?.collaborative_exit(params).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_get_collaborative_exit_fee_estimate(params: JsValue) -> Result<JsValue, JsValue> {
    map_js_async(async {
        #[derive(Deserialize)]
        struct Params {
            #[serde(rename = "destinationAddress")]
            destination_address: String,
            #[serde(rename = "amountSats", default)]
            amount_sats: Option<u64>,
        }
        let params: Params = serde_wasm_bindgen::from_value(params)?;
        to_js_value(
            active_session_rc()?
                .collaborative_exit_fee_estimate(&params.destination_address, params.amount_sats)
                .await?,
        )
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_estimate_unilateral_exit(params: JsValue) -> Result<JsValue, JsValue> {
    map_js_async(async {
        let params: UnilateralExitFeeParams = serde_wasm_bindgen::from_value(params)?;
        to_js_value(
            active_session_rc()?
                .estimate_unilateral_exit(params)
                .await?,
        )
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_run_unilateral_unroll(
    txid: String,
    vout: u32,
    on_progress: js_sys::Function,
) -> Result<JsValue, JsValue> {
    map_js_async(async {
        let result = active_session_rc()?
            .run_unilateral_unroll(&txid, vout, |event| {
                if let Ok(value) = serde_wasm_bindgen::to_value(&event) {
                    let _ = on_progress.call1(&JsValue::NULL, &value);
                }
            })
            .await?;
        to_js_value(result)
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_complete_unilateral_exit(params: JsValue) -> Result<String, JsValue> {
    map_js_async(async {
        let params: CompleteUnilateralExitParams = serde_wasm_bindgen::from_value(params)?;
        active_session_rc()?.complete_unilateral_exit(params).await
    })
    .await
}
