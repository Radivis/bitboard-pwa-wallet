mod api_types;
mod balance_display;
mod constants;
mod error;
mod esplora_blockchain;
mod exit_balance;
mod network;
mod offchain_snapshot;
mod persistence;
mod session;
#[cfg(target_arch = "wasm32")]
mod wasm_sleep;

#[cfg(test)]
mod persistence_tests;
#[cfg(test)]
mod receive_address_tests;
#[cfg(test)]
mod session_boarding_utxo_tests;
#[cfg(test)]
mod session_exit_candidate_tests;
#[cfg(test)]
mod session_mapper_tests;

use std::cell::RefCell;
use std::future::Future;
use std::rc::Rc;

use wasm_bindgen::prelude::*;

use crate::api_types::{
    CollaborativeExitFeeEstimateParams, CollaborativeExitParams, CompleteUnilateralExitParams,
    OpenSessionParams, SendPaymentParams, UnilateralExitFeeParams,
};
use crate::error::{ArkResult, ArkWasmError, map_js_error};
use crate::network::NetworkMode;
use crate::session::ArkSession;

thread_local! {
    static ACTIVE_SESSION: RefCell<Option<Rc<ArkSession>>> = const { RefCell::new(None) };
}

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

fn active_session_rc() -> ArkResult<Rc<ArkSession>> {
    ACTIVE_SESSION.with(|session_cell| {
        let session_borrow = session_cell
            .try_borrow()
            .map_err(|_| ArkWasmError::SessionAlreadyBorrowed)?;
        session_borrow.clone().ok_or(ArkWasmError::SessionNotOpen)
    })
}

fn with_session<F, R>(callback: F) -> ArkResult<R>
where
    F: FnOnce(&ArkSession) -> ArkResult<R>,
{
    let session = active_session_rc()?;
    callback(session.as_ref())
}

async fn with_session_async<F, Fut, R>(run: F) -> ArkResult<R>
where
    F: FnOnce(Rc<ArkSession>) -> Fut,
    Fut: Future<Output = ArkResult<R>>,
{
    let session = active_session_rc()?;
    run(session).await
}

async fn export_session_json<T, F, Fut>(run: F) -> ArkResult<JsValue>
where
    T: serde::Serialize,
    F: FnOnce(Rc<ArkSession>) -> Fut,
    Fut: Future<Output = ArkResult<T>>,
{
    to_js_value(with_session_async(run).await?)
}

fn clear_active_session() -> ArkResult<()> {
    ACTIVE_SESSION.with(|session_cell| {
        let mut session_borrow_mut = session_cell
            .try_borrow_mut()
            .map_err(|_| ArkWasmError::SessionAlreadyBorrowed)?;
        session_borrow_mut.take();
        Ok(())
    })
}

fn to_js_value<T: serde::Serialize>(value: T) -> ArkResult<JsValue> {
    Ok(serde_wasm_bindgen::to_value(&value)?)
}

async fn map_js_async<T>(future: impl Future<Output = ArkResult<T>>) -> Result<T, JsValue> {
    map_js_error(future.await)
}

#[wasm_bindgen]
pub async fn ark_open_session(params: JsValue) -> Result<JsValue, JsValue> {
    map_js_async(async {
        let params: OpenSessionParams = serde_wasm_bindgen::from_value(params)?;
        let network_mode = NetworkMode::parse(&params.network_mode)
            .ok_or_else(|| ArkWasmError::UnsupportedNetworkMode(params.network_mode.clone()))?;

        let (session, migration_hint) = ArkSession::open(
            &params.mnemonic,
            network_mode,
            params.ark_server_url,
            params.delegator_url,
            params.esplora_url,
            params.sdk_persistence_json.as_deref(),
        )
        .await?;

        let arkade_address = session.peek_offchain_address()?;
        let operator_signer_pk_hex = session.operator_signer_pk_hex();
        let signer_migration_hint =
            migration_hint.map(|hint| crate::api_types::OperatorSignerMigrationHintDto {
                previous_signer_pk_hex: hint.previous_signer_pk_hex,
                deprecated_status: hint.deprecated_status,
                cutoff_unix: hint.cutoff_unix,
            });
        ACTIVE_SESSION.with(|session_cell| -> ArkResult<()> {
            let mut session_borrow_mut = session_cell
                .try_borrow_mut()
                .map_err(|_| ArkWasmError::SessionAlreadyBorrowed)?;
            *session_borrow_mut = Some(Rc::new(session));
            Ok(())
        })?;

        to_js_value(crate::api_types::OpenSessionResult {
            arkade_address,
            operator_signer_pk_hex,
            signer_migration_hint,
        })
    })
    .await
}

#[wasm_bindgen]
pub fn ark_operator_signer_pk_hex() -> Result<String, JsValue> {
    map_js_error(with_session(|session| Ok(session.operator_signer_pk_hex())))
}

#[wasm_bindgen]
pub async fn ark_sync_with_operator() -> Result<JsValue, JsValue> {
    map_js_async(async {
        let result =
            with_session_async(|session| async move { session.sync_with_operator().await }).await?;
        to_js_value(result)
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_migrate_deprecated_signer_vtxos() -> Result<(), JsValue> {
    map_js_async(async {
        with_session_async(|session| async move { session.migrate_deprecated_signer_vtxos().await })
            .await
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
        export_session_json(|session| async move { session.balance().await }).await
    })
    .await
}

#[wasm_bindgen]
pub fn ark_get_address() -> Result<String, JsValue> {
    map_js_error(with_session(|session| session.peek_offchain_address()))
}

#[wasm_bindgen]
pub fn ark_reveal_next_receive_address() -> Result<String, JsValue> {
    map_js_error(with_session(|session| {
        session.reveal_next_offchain_address()
    }))
}

#[wasm_bindgen]
pub fn ark_get_boarding_address() -> Result<String, JsValue> {
    map_js_error(with_session(|session| session.boarding_address()))
}

#[wasm_bindgen]
pub async fn ark_get_boarding_status() -> Result<JsValue, JsValue> {
    map_js_async(async {
        export_session_json(|session| async move { session.boarding_status().await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_send_payment(params: JsValue) -> Result<String, JsValue> {
    map_js_async(async {
        let params: SendPaymentParams = serde_wasm_bindgen::from_value(params)?;
        with_session_async(|session| async move { session.send_payment(params).await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_get_transaction_history() -> Result<JsValue, JsValue> {
    map_js_async(async {
        export_session_json(|session| async move { session.transaction_history().await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_get_delegate_info() -> Result<JsValue, JsValue> {
    map_js_async(async {
        export_session_json(|session| async move { session.delegate_info().await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_get_expiring_vtxo_count() -> Result<u32, JsValue> {
    map_js_async(async {
        with_session_async(|session| async move { session.expiring_vtxo_count().await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_get_vtxo_expiry_status() -> Result<JsValue, JsValue> {
    map_js_async(async {
        export_session_json(|session| async move { session.vtxo_expiry_status().await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_renew_vtxos_now() -> Result<Option<String>, JsValue> {
    map_js_async(async {
        with_session_async(|session| async move { session.renew_vtxos_now().await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_delegate_spendable_vtxos() -> Result<JsValue, JsValue> {
    map_js_async(async {
        export_session_json(|session| async move { session.delegate_spendable_vtxos().await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_finalize_pending_transactions() -> Result<JsValue, JsValue> {
    map_js_async(async {
        export_session_json(|session| async move { session.finalize_pending_transactions().await })
            .await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_onboard_boarded_utxos() -> Result<Option<String>, JsValue> {
    map_js_async(async {
        with_session_async(|session| async move { session.onboard_boarded_utxos().await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_get_recoverable_vtxo_fee_estimate() -> Result<JsValue, JsValue> {
    map_js_async(async {
        export_session_json(|session| async move { session.recoverable_vtxo_fee_estimate().await })
            .await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_recover_recoverable_vtxos() -> Result<Option<String>, JsValue> {
    map_js_async(async {
        with_session_async(|session| async move { session.recover_recoverable_vtxos().await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_list_exit_candidates() -> Result<JsValue, JsValue> {
    map_js_async(async {
        export_session_json(|session| async move { session.list_exit_candidates().await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_get_onchain_bumper_info() -> Result<JsValue, JsValue> {
    map_js_async(async {
        export_session_json(|session| async move { session.onchain_bumper_info().await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_collaborative_exit(params: JsValue) -> Result<String, JsValue> {
    map_js_async(async {
        let params: CollaborativeExitParams = serde_wasm_bindgen::from_value(params)?;
        with_session_async(|session| async move { session.collaborative_exit(params).await }).await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_get_collaborative_exit_fee_estimate(params: JsValue) -> Result<JsValue, JsValue> {
    map_js_async(async {
        let params: CollaborativeExitFeeEstimateParams = serde_wasm_bindgen::from_value(params)?;
        export_session_json(|session| async move {
            session
                .collaborative_exit_fee_estimate(&params.destination_address, params.amount_sats)
                .await
        })
        .await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_estimate_unilateral_exit(params: JsValue) -> Result<JsValue, JsValue> {
    map_js_async(async {
        let params: UnilateralExitFeeParams = serde_wasm_bindgen::from_value(params)?;
        export_session_json(|session| async move { session.estimate_unilateral_exit(params).await })
            .await
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
        export_session_json(|session| async move {
            session
                .run_unilateral_unroll(&txid, vout, |event| {
                    if let Ok(value) = serde_wasm_bindgen::to_value(&event) {
                        let _ = on_progress.call1(&JsValue::NULL, &value);
                    }
                })
                .await
        })
        .await
    })
    .await
}

#[wasm_bindgen]
pub async fn ark_complete_unilateral_exit(params: JsValue) -> Result<String, JsValue> {
    map_js_async(async {
        let params: CompleteUnilateralExitParams = serde_wasm_bindgen::from_value(params)?;
        with_session_async(|session| async move { session.complete_unilateral_exit(params).await })
            .await
    })
    .await
}
