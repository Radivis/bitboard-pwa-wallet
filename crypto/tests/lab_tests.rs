//! Lab build and sign tests. Run with: wasm-pack test --target web --headless
//! (requires wasm32 target; skipped on native)

use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

use bitboard_crypto::{build_and_sign_lab_transaction, get_lab_change_address, lab, load_wallet};

#[wasm_bindgen_test]
fn build_and_sign_lab_transaction_returns_signed_tx() {
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

    let script_pubkey_hex = lab::lab_address_to_script_pubkey_hex(&first_address).unwrap();
    let utxos_json = format!(
        r#"[{{"txid":"{}","vout":0,"amount_sats":50000,"script_pubkey_hex":"{}","address":"{}"}}]"#,
        "a".repeat(64),
        script_pubkey_hex,
        first_address
    );

    let change_address = get_lab_change_address().expect("get change address");
    let result = build_and_sign_lab_transaction(
        &utxos_json,
        "bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        40000,
        1.0,
        &change_address,
    )
    .expect("build and sign");

    let result_str = result.as_string().expect("result should be string");
    let parsed: serde_json::Value = serde_json::from_str(&result_str).unwrap();
    let signed_tx_hex = parsed["signed_tx_hex"].as_str().expect("signed_tx_hex");
    let fee_sats = parsed["fee_sats"].as_u64().expect("fee_sats");

    assert!(!signed_tx_hex.is_empty());
    assert!(fee_sats > 0);
}
