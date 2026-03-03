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

impl From<bdk_wallet::keys::bip39::Error> for CryptoError {
    fn from(e: bdk_wallet::keys::bip39::Error) -> Self {
        CryptoError::Mnemonic(e.to_string())
    }
}

impl From<bdk_wallet::descriptor::DescriptorError> for CryptoError {
    fn from(e: bdk_wallet::descriptor::DescriptorError) -> Self {
        CryptoError::Descriptor(e.to_string())
    }
}
