use serde::{Deserialize, Serialize};
use std::fmt::Display;
use thiserror::Error;
use wasm_bindgen::JsValue;

pub const CODE_MNEMONIC: &str = "mnemonic";
pub const CODE_DESCRIPTOR: &str = "descriptor";
pub const CODE_WALLET: &str = "wallet";
pub const CODE_BLOCKCHAIN: &str = "blockchain";
pub const CODE_TRANSACTION: &str = "transaction";
pub const CODE_SERIALIZATION: &str = "serialization";
pub const CODE_NO_ACTIVE_WALLET: &str = "no_active_wallet";
pub const CODE_WALLET_ALREADY_BORROWED: &str = "wallet_already_borrowed";
pub const CODE_WALLET_NOT_LOADED_FOR_LAB: &str = "wallet_not_loaded_for_lab";

pub const MSG_NO_ACTIVE_WALLET: &str = "No active wallet. Call create_wallet or load_wallet first.";
pub const MSG_WALLET_ALREADY_BORROWED: &str =
    "Wallet is already borrowed — likely a previous operation panicked";
pub const MSG_WALLET_NOT_LOADED_FOR_LAB: &str = "No wallet loaded for lab. Load wallet first.";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmCryptoErrorPayload {
    pub code: &'static str,
    pub message: String,
}

/// Extension trait for `Result<T, CryptoError>` to map into structured `JsValue`.
pub trait MapErrToJs<T> {
    fn map_err_to_js(self) -> Result<T, JsValue>;
}

impl<T> MapErrToJs<T> for Result<T, CryptoError> {
    fn map_err_to_js(self) -> Result<T, JsValue> {
        self.map_err(crypto_error_to_js)
    }
}

/// Maps a `Display` error to a plain-string `JsValue` (non-crypto WASM errors).
pub trait MapDisplayErrToJs<T, E> {
    fn map_display_err_to_js(self) -> Result<T, JsValue>;
}

impl<T, E: Display> MapDisplayErrToJs<T, E> for Result<T, E> {
    fn map_display_err_to_js(self) -> Result<T, JsValue> {
        self.map_err(|error| JsValue::from_str(&error.to_string()))
    }
}

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

impl CryptoError {
    pub fn code(&self) -> &'static str {
        match self {
            CryptoError::Mnemonic(_) => CODE_MNEMONIC,
            CryptoError::Descriptor(_) => CODE_DESCRIPTOR,
            CryptoError::Wallet(_) => CODE_WALLET,
            CryptoError::Blockchain(_) => CODE_BLOCKCHAIN,
            CryptoError::Transaction(_) => CODE_TRANSACTION,
            CryptoError::Serialization(_) => CODE_SERIALIZATION,
        }
    }

    pub fn to_wasm_payload(&self) -> WasmCryptoErrorPayload {
        WasmCryptoErrorPayload {
            code: self.code(),
            message: self.to_string(),
        }
    }
}

pub fn wasm_crypto_error(code: &'static str, message: impl Into<String>) -> JsValue {
    let payload = WasmCryptoErrorPayload {
        code,
        message: message.into(),
    };
    serde_wasm_bindgen::to_value(&payload)
        .unwrap_or_else(|_| JsValue::from_str("Failed to serialize WASM crypto error"))
}

pub fn crypto_error_to_js(error: CryptoError) -> JsValue {
    wasm_crypto_error(error.code(), error.to_string())
}

impl From<CryptoError> for JsValue {
    fn from(error: CryptoError) -> JsValue {
        crypto_error_to_js(error)
    }
}

impl From<bdk_wallet::keys::bip39::Error> for CryptoError {
    fn from(error: bdk_wallet::keys::bip39::Error) -> Self {
        CryptoError::Mnemonic(error.to_string())
    }
}

impl From<bdk_wallet::descriptor::DescriptorError> for CryptoError {
    fn from(error: bdk_wallet::descriptor::DescriptorError) -> Self {
        CryptoError::Descriptor(error.to_string())
    }
}

impl From<serde_json::Error> for CryptoError {
    fn from(error: serde_json::Error) -> Self {
        CryptoError::Serialization(error.to_string())
    }
}

impl From<bdk_esplora::esplora_client::Error> for CryptoError {
    fn from(error: bdk_esplora::esplora_client::Error) -> Self {
        CryptoError::Blockchain(error.to_string())
    }
}

impl From<Box<bdk_esplora::esplora_client::Error>> for CryptoError {
    fn from(error: Box<bdk_esplora::esplora_client::Error>) -> Self {
        (*error).into()
    }
}

impl From<bdk_wallet::error::CreateTxError> for CryptoError {
    fn from(error: bdk_wallet::error::CreateTxError) -> Self {
        CryptoError::Transaction(error.to_string())
    }
}

// BDK SignerError is deprecated pending replacement; we still need it for sign().
#[allow(deprecated)]
impl From<bdk_wallet::signer::SignerError> for CryptoError {
    fn from(error: bdk_wallet::signer::SignerError) -> Self {
        CryptoError::Transaction(error.to_string())
    }
}

impl From<bdk_wallet::chain::local_chain::CannotConnectError> for CryptoError {
    fn from(error: bdk_wallet::chain::local_chain::CannotConnectError) -> Self {
        CryptoError::Blockchain(error.to_string())
    }
}

impl From<bitcoin::address::ParseError> for CryptoError {
    fn from(error: bitcoin::address::ParseError) -> Self {
        CryptoError::Transaction(error.to_string())
    }
}
