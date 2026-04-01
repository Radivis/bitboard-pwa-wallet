use bitcoin::secp256k1::{PublicKey, Secp256k1};
use lightning::sign::KeysManager;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Creates an LDK `KeysManager` from a 32-byte seed and returns
/// the Lightning node public key as a hex-encoded compressed point.
#[wasm_bindgen]
pub fn generate_node_id(
    seed: &[u8],
    current_time_secs: u64,
    current_time_nanos: u32,
) -> Result<String, JsValue> {
    let seed_array: [u8; 32] = seed
        .try_into()
        .map_err(|_| JsValue::from_str("Seed must be exactly 32 bytes"))?;

    let keys_manager = KeysManager::new(&seed_array, current_time_secs, current_time_nanos, true);
    let node_secret = keys_manager.get_node_secret_key();

    let secp = Secp256k1::new();
    let node_pubkey = PublicKey::from_secret_key(&secp, &node_secret);

    Ok(hex::encode(node_pubkey.serialize()))
}
