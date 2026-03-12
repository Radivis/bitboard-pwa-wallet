//! Lab signing tests. Run with: wasm-pack test --target web --headless
//! (requires wasm32 target; skipped on native)

use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

use bitboard_crypto::{get_lab_change_address, lab, load_wallet, sign_lab_transaction};

#[wasm_bindgen_test]
fn sign_lab_transaction_signs_wallet_utxo() {
    let mnemonic = bitboard_crypto::generate_mnemonic(12).expect("generate mnemonic");
    let create_result =
        bitboard_crypto::create_wallet(&mnemonic, "regtest", "taproot", 0).expect("create wallet");

    let first_address = js_sys::Reflect::get(&create_result, &JsValue::from_str("first_address"))
        .expect("first_address")
        .as_string()
        .expect("first_address string");
    let changeset = js_sys::Reflect::get(&create_result, &JsValue::from_str("changeset_json"))
        .expect("changeset_json")
        .as_string()
        .expect("changeset string");
    let external = js_sys::Reflect::get(&create_result, &JsValue::from_str("external_descriptor"))
        .expect("external_descriptor")
        .as_string()
        .expect("external string");
    let internal = js_sys::Reflect::get(&create_result, &JsValue::from_str("internal_descriptor"))
        .expect("internal_descriptor")
        .as_string()
        .expect("internal string");

    load_wallet(&external, &internal, "regtest", &changeset).expect("load wallet");

    let spk_hex = lab::lab_address_to_script_pubkey_hex(&first_address).unwrap();
    let utxos_json = format!(
        r#"[{{"txid":"{}","vout":0,"amount_sats":50000,"script_pubkey_hex":"{}","address":"{}"}}]"#,
        "a".repeat(64),
        spk_hex,
        first_address
    );

    let change_addr = get_lab_change_address().expect("get change address");
    let build_result = lab::lab_build_transaction_with_change(
        &utxos_json,
        "bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        40000,
        1.0,
        &change_addr,
    )
    .unwrap();

    let build_str = build_result
        .as_string()
        .expect("build result should be string");
    let build: serde_json::Value = serde_json::from_str(&build_str).unwrap();
    let unsigned_tx_hex = build["tx_hex"].as_str().unwrap();

    let signed_tx_hex = sign_lab_transaction(unsigned_tx_hex, &utxos_json).expect("sign");

    assert!(!signed_tx_hex.is_empty());
    assert_ne!(signed_tx_hex, unsigned_tx_hex);
}
