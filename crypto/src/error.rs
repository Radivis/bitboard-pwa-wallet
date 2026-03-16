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

impl From<serde_json::Error> for CryptoError {
    fn from(e: serde_json::Error) -> Self {
        CryptoError::Serialization(e.to_string())
    }
}

impl From<bdk_esplora::esplora_client::Error> for CryptoError {
    fn from(e: bdk_esplora::esplora_client::Error) -> Self {
        CryptoError::Blockchain(e.to_string())
    }
}

impl From<Box<bdk_esplora::esplora_client::Error>> for CryptoError {
    fn from(e: Box<bdk_esplora::esplora_client::Error>) -> Self {
        (*e).into()
    }
}

impl From<bdk_wallet::error::CreateTxError> for CryptoError {
    fn from(e: bdk_wallet::error::CreateTxError) -> Self {
        CryptoError::Transaction(e.to_string())
    }
}

// BDK SignerError is deprecated pending replacement; we still need it for sign().
#[allow(deprecated)]
impl From<bdk_wallet::signer::SignerError> for CryptoError {
    fn from(e: bdk_wallet::signer::SignerError) -> Self {
        CryptoError::Transaction(e.to_string())
    }
}

impl From<bdk_wallet::chain::local_chain::CannotConnectError> for CryptoError {
    fn from(e: bdk_wallet::chain::local_chain::CannotConnectError) -> Self {
        CryptoError::Blockchain(e.to_string())
    }
}

impl From<bitcoin::address::ParseError> for CryptoError {
    fn from(e: bitcoin::address::ParseError) -> Self {
        CryptoError::Transaction(e.to_string())
    }
}
