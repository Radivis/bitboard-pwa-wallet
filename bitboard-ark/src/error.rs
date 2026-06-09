use std::fmt;

#[derive(Debug)]
pub enum ArkWasmError {
    Message(String),
}

impl fmt::Display for ArkWasmError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Message(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for ArkWasmError {}

impl From<ark_client::Error> for ArkWasmError {
    fn from(error: ark_client::Error) -> Self {
        Self::Message(error.to_string())
    }
}

impl From<ark_delegator::Error> for ArkWasmError {
    fn from(error: ark_delegator::Error) -> Self {
        Self::Message(error.to_string())
    }
}

impl From<bip39::Error> for ArkWasmError {
    fn from(error: bip39::Error) -> Self {
        Self::Message(error.to_string())
    }
}

impl From<bitcoin::bip32::Error> for ArkWasmError {
    fn from(error: bitcoin::bip32::Error) -> Self {
        Self::Message(error.to_string())
    }
}

impl From<serde_json::Error> for ArkWasmError {
    fn from(error: serde_json::Error) -> Self {
        Self::Message(error.to_string())
    }
}

impl From<serde_wasm_bindgen::Error> for ArkWasmError {
    fn from(error: serde_wasm_bindgen::Error) -> Self {
        Self::Message(error.to_string())
    }
}

pub type ArkResult<T> = Result<T, ArkWasmError>;

pub fn map_js_error<T>(result: ArkResult<T>) -> Result<T, wasm_bindgen::JsValue> {
    result.map_err(|error| wasm_bindgen::JsValue::from_str(&error.to_string()))
}
