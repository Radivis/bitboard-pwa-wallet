use thiserror::Error;
use wasm_bindgen::JsValue;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("Mnemonic error: {0}")]
    Mnemonic(String),
    #[error("Descriptor error: {0}")]
    Descriptor(String),
    #[error("Wallet error: {0}")]
    Wallet(String),
    #[error("Blockchain error: {0}")]
    Blockchain(String),
    #[error("Transaction error: {0}")]
    Transaction(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
}

impl From<CryptoError> for JsValue {
    fn from(error: CryptoError) -> JsValue {
        JsValue::from_str(&error.to_string())
    }
}
