//! Arkoor address checks and payments.

use wasm_bindgen::prelude::*;

use crate::session::{
    bark_error, finish_wallet_operation, require_session_synced, take_active_wallet,
};

const ARKOOR_NOT_SYNCED: &str = "not_synced";
const ARKOOR_ARKADE_ADDRESS: &str = "arkade_address";
const ARKOOR_INVALID_ADDRESS: &str = "invalid_address";
const ARKOOR_NETWORK_MISMATCH: &str = "network_mismatch";
const ARKOOR_SERVER_MISMATCH: &str = "server_mismatch";
const ARKOOR_POLICY_NOT_SUPPORTED: &str = "policy_not_supported";
const ARKOOR_UNKNOWN_DELIVERY: &str = "unknown_delivery";

fn require_synced_for_arkoor() -> Result<(), String> {
    require_session_synced().map_err(|_| ARKOOR_NOT_SYNCED.to_owned())
}

fn parse_arkoor_destination(address: &str) -> Result<bark::ark::Address, String> {
    address
        .trim()
        .parse::<bark::ark::Address>()
        .map_err(|err| match err {
            bark::ark::address::ParseAddressError::Arkade => ARKOOR_ARKADE_ADDRESS.to_owned(),
            _ => ARKOOR_INVALID_ADDRESS.to_owned(),
        })
}

fn arkoor_address_error_code(err: bark::ArkoorAddressError) -> String {
    match err {
        bark::ArkoorAddressError::NetworkMismatch => ARKOOR_NETWORK_MISMATCH.to_owned(),
        bark::ArkoorAddressError::ServerMismatch => ARKOOR_SERVER_MISMATCH.to_owned(),
        bark::ArkoorAddressError::PolicyNotSupported(_) => ARKOOR_POLICY_NOT_SUPPORTED.to_owned(),
        bark::ArkoorAddressError::UnknownDeliveryMechanism(_) => ARKOOR_UNKNOWN_DELIVERY.to_owned(),
        bark::ArkoorAddressError::Other(_) => ARKOOR_INVALID_ADDRESS.to_owned(),
    }
}

/// Refuses until this session has synced. Arkade addresses and wrong-server
/// addresses return a stable code instead of a Bark display string.
#[wasm_bindgen]
pub async fn bark_validate_arkoor_address(address: String) -> Result<(), JsValue> {
    require_synced_for_arkoor().map_err(|err| JsValue::from_str(&err))?;
    let destination = parse_arkoor_destination(&address).map_err(|err| JsValue::from_str(&err))?;
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        wallet
            .validate_arkoor_address(&destination)
            .await
            .map_err(arkoor_address_error_code)?;
        Ok(())
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Local Arkoor fee quote. bark-wallet 0.7.1 returns zero; it does not ask the server.
#[wasm_bindgen]
pub async fn bark_estimate_arkoor_payment_fee(amount_sats: u64) -> Result<u64, JsValue> {
    require_synced_for_arkoor().map_err(|err| JsValue::from_str(&err))?;
    let amount = bitcoin::Amount::from_sat(amount_sats);
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let estimate = wallet
            .estimate_arkoor_payment_fee(amount)
            .await
            .map_err(bark_error)?;
        Ok(estimate.fee.to_sat())
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Sends an Arkoor payment. The caller syncs afterwards.
#[wasm_bindgen]
pub async fn bark_send_arkoor(address: String, amount_sats: u64) -> Result<(), JsValue> {
    require_synced_for_arkoor().map_err(|err| JsValue::from_str(&err))?;
    let destination = parse_arkoor_destination(&address).map_err(|err| JsValue::from_str(&err))?;
    let amount = bitcoin::Amount::from_sat(amount_sats);
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        wallet
            .validate_arkoor_address(&destination)
            .await
            .map_err(arkoor_address_error_code)?;
        wallet
            .send_arkoor_payment(&destination, amount)
            .await
            .map_err(bark_error)?;
        Ok(())
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}
