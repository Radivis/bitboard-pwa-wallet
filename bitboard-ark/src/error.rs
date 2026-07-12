use serde::{Deserialize, Serialize};
use thiserror::Error;
use wasm_bindgen::JsValue;

pub const MSG_SESSION_NOT_OPEN: &str = "Arkade session is not open";
pub const MSG_SESSION_ALREADY_BORROWED: &str =
    "Arkade session is already borrowed — likely a previous operation panicked";

pub const CODE_SESSION_NOT_OPEN: &str = "session_not_open";
pub const CODE_SESSION_ALREADY_BORROWED: &str = "session_already_borrowed";
pub const CODE_NETWORK: &str = "network";
pub const CODE_VALIDATION: &str = "validation";
pub const CODE_DELEGATOR: &str = "delegator";
pub const CODE_BOARDING: &str = "boarding";
pub const CODE_SNAPSHOT: &str = "snapshot";
pub const CODE_PERSISTENCE: &str = "persistence";
pub const CODE_WALLET: &str = "wallet";
pub const CODE_CLIENT: &str = "client";
pub const CODE_OPERATOR_INDEXER_CATCHING_UP: &str = "operator_indexer_catching_up";
pub const CODE_UNILATERAL_UNROLL_NOT_CONFIRMED_ON_CHAIN: &str =
    "unilateral_unroll_not_confirmed_on_chain";
pub const CODE_BLOCKCHAIN: &str = "blockchain";
pub const CODE_MNEMONIC: &str = "mnemonic";
pub const CODE_SERIALIZATION: &str = "serialization";

pub const MSG_SEND_AMOUNT_MUST_BE_POSITIVE: &str = "send amount must be greater than zero";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmArkErrorPayload {
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Error)]
pub enum ArkWasmError {
    #[error("{MSG_SESSION_NOT_OPEN}")]
    SessionNotOpen,

    #[error("{MSG_SESSION_ALREADY_BORROWED}")]
    SessionAlreadyBorrowed,

    #[error("unsupported network mode: {0}")]
    UnsupportedNetworkMode(String),

    #[error("Esplora URL must not be empty")]
    EmptyEsploraUrl,

    #[error("invalid txid: {0}")]
    InvalidTxid(String),

    #[error("invalid delegator pubkey: {0}")]
    InvalidDelegatorPubkey(String),

    #[error("invalid delegator fee: {0}")]
    InvalidDelegatorFee(String),

    #[error("invalid onchain address: {0}")]
    InvalidOnchainAddress(String),

    #[error("{MSG_SEND_AMOUNT_MUST_BE_POSITIVE}")]
    InvalidSendAmount,

    #[error("VTXO not found for outpoint {txid}:{vout}")]
    VtxoNotFound { txid: String, vout: u32 },

    #[error("delegator service is not configured")]
    DelegatorNotConfigured,

    #[error("vtxo_txids must not be empty")]
    EmptyVtxoTxids,

    #[error("VTXO {txid} is not in unilateral exit")]
    VtxoNotInUnilateralExit { txid: String },

    #[error("VTXO {txid} timelock has not elapsed yet — complete is not available")]
    VtxoUnilateralExitNotReady { txid: String },

    #[error(
        "Operator indexer is still catching up after unilateral unroll. Wait a moment and try Complete exit again."
    )]
    OperatorIndexerCatchingUp,

    #[error("Unilateral unroll could not be confirmed on-chain ({txid})")]
    UnilateralUnrollNotConfirmedOnChain { txid: String },

    #[error("{0}")]
    Boarding(String),

    #[error("{0}")]
    Snapshot(String),

    #[error("{0}")]
    Persistence(String),

    #[error("Wallet error: {0}")]
    Wallet(String),

    #[error("Ark core error: {0}")]
    Core(#[from] ark_core::Error),

    #[error("Ark client error: {0}")]
    Client(#[from] ark_client::Error),

    #[error("Delegator error: {0}")]
    Delegator(#[from] ark_delegator::Error),

    #[error("Blockchain error: {0}")]
    Blockchain(String),

    #[error("Mnemonic error: {0}")]
    Mnemonic(#[from] bip39::Error),

    #[error("BIP32 error: {0}")]
    Bip32(#[from] bitcoin::bip32::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("WASM bindgen error: {0}")]
    WasmBindgen(#[from] serde_wasm_bindgen::Error),
}

impl ArkWasmError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::SessionNotOpen => CODE_SESSION_NOT_OPEN,
            Self::SessionAlreadyBorrowed => CODE_SESSION_ALREADY_BORROWED,
            Self::UnsupportedNetworkMode(_) => CODE_NETWORK,
            Self::EmptyEsploraUrl
            | Self::InvalidTxid(_)
            | Self::InvalidDelegatorPubkey(_)
            | Self::InvalidOnchainAddress(_)
            | Self::InvalidSendAmount
            | Self::VtxoNotFound { .. }
            | Self::EmptyVtxoTxids
            | Self::VtxoNotInUnilateralExit { .. }
            | Self::VtxoUnilateralExitNotReady { .. } => CODE_VALIDATION,
            Self::OperatorIndexerCatchingUp => CODE_OPERATOR_INDEXER_CATCHING_UP,
            Self::UnilateralUnrollNotConfirmedOnChain { .. } => {
                CODE_UNILATERAL_UNROLL_NOT_CONFIRMED_ON_CHAIN
            }
            Self::DelegatorNotConfigured | Self::Delegator(_) | Self::InvalidDelegatorFee(_) => {
                CODE_DELEGATOR
            }
            Self::Boarding(_) => CODE_BOARDING,
            Self::Snapshot(_) => CODE_SNAPSHOT,
            Self::Persistence(_) => CODE_PERSISTENCE,
            Self::Wallet(_) => CODE_WALLET,
            Self::Core(_) | Self::Client(_) => CODE_CLIENT,
            Self::Blockchain(_) => CODE_BLOCKCHAIN,
            Self::Mnemonic(_) | Self::Bip32(_) => CODE_MNEMONIC,
            Self::Serialization(_) | Self::WasmBindgen(_) => CODE_SERIALIZATION,
        }
    }

    pub fn to_wasm_payload(&self) -> WasmArkErrorPayload {
        WasmArkErrorPayload {
            code: self.code(),
            message: self.to_string(),
        }
    }
}

pub type ArkResult<T> = Result<T, ArkWasmError>;

pub fn ark_error_to_js(error: ArkWasmError) -> JsValue {
    serde_wasm_bindgen::to_value(&error.to_wasm_payload())
        .unwrap_or_else(|_| JsValue::from_str(&error.to_string()))
}

pub fn map_js_error<T>(result: ArkResult<T>) -> Result<T, JsValue> {
    result.map_err(ark_error_to_js)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_not_open_has_stable_code_and_message() {
        let error = ArkWasmError::SessionNotOpen;
        assert_eq!(error.code(), CODE_SESSION_NOT_OPEN);
        assert_eq!(error.to_string(), MSG_SESSION_NOT_OPEN);
    }

    #[test]
    fn invalid_txid_uses_validation_code() {
        let error = ArkWasmError::InvalidTxid("bad".into());
        assert_eq!(error.code(), CODE_VALIDATION);
        assert!(error.to_string().contains("invalid txid"));
    }

    #[test]
    fn invalid_send_amount_uses_validation_code() {
        let error = ArkWasmError::InvalidSendAmount;
        assert_eq!(error.code(), CODE_VALIDATION);
        assert_eq!(error.to_string(), MSG_SEND_AMOUNT_MUST_BE_POSITIVE);
    }

    #[test]
    fn operator_indexer_catching_up_has_stable_code() {
        let error = ArkWasmError::OperatorIndexerCatchingUp;
        assert_eq!(error.code(), CODE_OPERATOR_INDEXER_CATCHING_UP);
        assert!(
            error
                .to_string()
                .contains("Operator indexer is still catching up")
        );
    }

    #[test]
    fn unilateral_unroll_not_confirmed_on_chain_has_stable_code() {
        let error = ArkWasmError::UnilateralUnrollNotConfirmedOnChain { txid: "abc".into() };
        assert_eq!(error.code(), CODE_UNILATERAL_UNROLL_NOT_CONFIRMED_ON_CHAIN);
        assert!(error.to_string().contains("abc"));
    }

    #[test]
    fn wasm_payload_round_trips_fields() {
        let error = ArkWasmError::DelegatorNotConfigured;
        let payload = error.to_wasm_payload();
        assert_eq!(payload.code, CODE_DELEGATOR);
        assert_eq!(payload.message, error.to_string());
    }

    #[test]
    fn client_join_batch_event_stream_error_surfaces_status_in_wasm_payload() {
        use ark_client::error::{ErrorContext, IntoError};

        let event_stream_detail = "Event stream request failed with status 500 Internal Server Error: FUNCTION_INVOCATION_FAILED";
        let enriched_chain = format!("batch event stream: request failed: {event_stream_detail}");

        #[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
        let server_error = ark_client::Error::from(ark_client::ark_grpc_wasm_shim::Error::request(
            std::io::Error::new(std::io::ErrorKind::Other, enriched_chain.clone()),
        ));
        #[cfg(not(all(target_arch = "wasm32", target_os = "unknown")))]
        let server_error = enriched_chain.clone().into_error();

        let client_error = server_error.context("Failed to join batch");
        let wasm_error = ArkWasmError::Client(client_error);
        let payload = wasm_error.to_wasm_payload();

        assert_eq!(payload.code, CODE_CLIENT);
        assert!(payload.message.contains("500"));
        assert!(payload.message.contains("FUNCTION_INVOCATION"));
        assert!(
            !payload.message.ends_with("request failed"),
            "unexpected bare chain: {}",
            payload.message
        );
    }
}
