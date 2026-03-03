use wasm_bindgen::prelude::*;

pub mod blockchain;
pub mod error;
pub mod types;

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello from bitboard-crypto, {}!", name)
}
