use wasm_bindgen::prelude::*;

pub mod blockchain;
pub mod descriptors;
pub mod error;
pub mod mnemonic;
pub mod types;

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello from bitboard-crypto, {}!", name)
}

#[wasm_bindgen]
pub fn generate_mnemonic(word_count: u32) -> Result<String, JsValue> {
    mnemonic::generate_mnemonic(word_count).map_err(Into::into)
}

#[wasm_bindgen]
pub fn validate_mnemonic(mnemonic_str: &str) -> Result<bool, JsValue> {
    match mnemonic::validate_mnemonic(mnemonic_str) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[wasm_bindgen]
pub fn derive_descriptors(
    mnemonic_str: &str,
    network: &str,
    address_type: &str,
) -> Result<JsValue, JsValue> {
    let network = types::BitcoinNetwork::try_from(network).map_err(JsValue::from)?;
    let addr_type = types::AddressType::try_from(address_type).map_err(JsValue::from)?;

    let pair = descriptors::derive_descriptors(mnemonic_str, network, addr_type)
        .map_err(JsValue::from)?;

    serde_wasm_bindgen::to_value(&pair)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
