//! Lab build and sign tests. Run with: wasm-pack test --target web --headless
//! (requires wasm32 target; skipped on native)

use std::io::Cursor;

use bitcoin::consensus::Decodable;
use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

use bitboard_crypto::{build_and_sign_lab_transaction, get_lab_change_address, lab, load_wallet};

const TOTAL_UTXO_SATS: u64 = 50000;
const PAYMENT_SATS: u64 = 40000;
const FEE_RATE_SAT_PER_VB: f64 = 1.0;
const PAYMENT_ADDRESS: &str = "bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";

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

    load_wallet(&external, &internal, "regtest", &changeset, false).expect("load wallet");

    let script_pubkey_hex = lab::lab_address_to_script_pubkey_hex(&first_address).unwrap();
    let utxos_json = format!(
        r#"[{{"txid":"{}","vout":0,"amount_sats":{},"script_pubkey_hex":"{}","address":"{}"}}]"#,
        "a".repeat(64),
        TOTAL_UTXO_SATS,
        script_pubkey_hex,
        first_address
    );

    let change_address = get_lab_change_address().expect("get change address");
    let result = build_and_sign_lab_transaction(
        &utxos_json,
        PAYMENT_ADDRESS,
        PAYMENT_SATS,
        FEE_RATE_SAT_PER_VB,
        &change_address,
    )
    .expect("build and sign");

    let result_str = result.as_string().expect("result should be string");
    let parsed: serde_json::Value = serde_json::from_str(&result_str).unwrap();
    let signed_tx_hex = parsed["signed_tx_hex"].as_str().expect("signed_tx_hex");
    let fee_sats = parsed["fee_sats"].as_u64().expect("fee_sats");
    let has_change = parsed["has_change"].as_bool().expect("has_change");

    assert!(!signed_tx_hex.is_empty());
    assert!(fee_sats > 0, "fee must be positive");

    // Fee and change: total_in = payment + fee + change
    let expected_change = TOTAL_UTXO_SATS
        .saturating_sub(PAYMENT_SATS)
        .saturating_sub(fee_sats);
    assert!(
        has_change,
        "transaction should have a change output when inputs exceed payment + fee"
    );
    assert!(
        expected_change > 0,
        "change amount should be positive (fee_sats={}, total_in={}, payment={})",
        fee_sats,
        TOTAL_UTXO_SATS,
        PAYMENT_SATS
    );

    // Decode signed tx and assert structure
    let tx_bytes = hex::decode(signed_tx_hex).expect("signed_tx_hex must be valid hex");
    let tx: bitcoin::Transaction =
        bitcoin::Transaction::consensus_decode(&mut Cursor::new(&tx_bytes))
            .expect("signed tx must decode");

    let total_out: u64 = tx.output.iter().map(|o| o.value.to_sat()).sum();
    assert_eq!(
        total_out + fee_sats,
        TOTAL_UTXO_SATS,
        "inputs (total_in) must equal outputs + fee"
    );

    // Fee must be at least fee_rate * vsize (vsize = ceil(weight/4))
    let vsize = tx.weight().to_wu().div_ceil(4);
    let min_fee = vsize as u64 * (FEE_RATE_SAT_PER_VB as u64);
    assert!(
        fee_sats >= min_fee,
        "fee {} sats must be >= fee_rate * vsize ({} * {} = {})",
        fee_sats,
        FEE_RATE_SAT_PER_VB,
        vsize,
        min_fee
    );

    // Exactly two outputs: payment and change
    assert_eq!(tx.output.len(), 2, "expected payment + change outputs");

    let change_script_hex = lab::lab_address_to_script_pubkey_hex(&change_address).unwrap();
    let change_script_bytes = hex::decode(&change_script_hex).expect("change script hex");
    let change_script = bitcoin::ScriptBuf::from_bytes(change_script_bytes);

    // Classify the two outputs: one pays to the external payment address, one to our change address.
    let mut payment_output_index_and_sats: Option<(usize, u64)> = None;
    let mut change_output_index_and_sats: Option<(usize, u64)> = None;
    for (output_index, output) in tx.output.iter().enumerate() {
        let value_sats = output.value.to_sat();
        if output.script_pubkey == change_script {
            change_output_index_and_sats = Some((output_index, value_sats));
        } else {
            payment_output_index_and_sats = Some((output_index, value_sats));
        }
    }

    let (_, payment_value) = payment_output_index_and_sats.expect("one output must be payment");
    let (_, change_value) =
        change_output_index_and_sats.expect("one output must be change to change_address");

    assert_eq!(
        payment_value, PAYMENT_SATS,
        "payment output must equal requested amount"
    );
    assert_eq!(
        change_value, expected_change,
        "change output must equal total_in - payment - fee"
    );
}
