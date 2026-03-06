use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

use bitboard_crypto::{
    create_wallet, derive_argon2_key, derive_descriptors, export_changeset, generate_mnemonic,
    get_balance, get_new_address, validate_mnemonic,
};

fn create_test_wallet() -> JsValue {
    let mnemonic = generate_mnemonic(12).expect("generate_mnemonic failed");
    create_wallet(&mnemonic, "signet", "taproot").expect("create_wallet failed")
}

#[wasm_bindgen_test]
fn generate_mnemonic_returns_12_words_via_wasm() {
    let mnemonic = generate_mnemonic(12).expect("should succeed");
    let word_count = mnemonic.split_whitespace().count();
    assert_eq!(word_count, 12);
}

#[wasm_bindgen_test]
fn generate_mnemonic_returns_24_words_via_wasm() {
    let mnemonic = generate_mnemonic(24).expect("should succeed");
    let word_count = mnemonic.split_whitespace().count();
    assert_eq!(word_count, 24);
}

#[wasm_bindgen_test]
fn generate_mnemonic_rejects_invalid_word_count() {
    let result = generate_mnemonic(13);
    assert!(result.is_err(), "word count 13 should be rejected");
}

#[wasm_bindgen_test]
fn validate_mnemonic_accepts_valid_via_wasm() {
    let mnemonic = generate_mnemonic(12).expect("generate failed");
    let is_valid = validate_mnemonic(&mnemonic).expect("validate failed");
    assert!(is_valid);
}

#[wasm_bindgen_test]
fn validate_mnemonic_rejects_invalid_via_wasm() {
    let is_valid =
        validate_mnemonic("foo bar baz qux quux corge grault garply waldo fred plugh xyzzy")
            .expect("validate should not error for garbage input");
    assert!(!is_valid);
}

#[wasm_bindgen_test]
fn derive_descriptors_returns_valid_jsvalue() {
    let mnemonic = generate_mnemonic(12).expect("generate failed");
    let result = derive_descriptors(&mnemonic, "signet", "taproot").expect("derive failed");

    let pair: serde_wasm_bindgen::Serializer = serde_wasm_bindgen::Serializer::json_compatible();
    let _ = pair;

    let external = js_sys::Reflect::get(&result, &JsValue::from_str("external"))
        .expect("missing 'external' field");
    let internal = js_sys::Reflect::get(&result, &JsValue::from_str("internal"))
        .expect("missing 'internal' field");

    assert!(external.is_string(), "external should be a string");
    assert!(internal.is_string(), "internal should be a string");

    let ext_str = external.as_string().unwrap();
    let int_str = internal.as_string().unwrap();
    assert!(
        !ext_str.is_empty(),
        "external descriptor should not be empty"
    );
    assert!(
        !int_str.is_empty(),
        "internal descriptor should not be empty"
    );
}

#[wasm_bindgen_test]
fn create_wallet_returns_serialized_result() {
    let result = create_test_wallet();

    let external = js_sys::Reflect::get(&result, &JsValue::from_str("external_descriptor"))
        .expect("missing external_descriptor");
    let internal = js_sys::Reflect::get(&result, &JsValue::from_str("internal_descriptor"))
        .expect("missing internal_descriptor");
    let first_address = js_sys::Reflect::get(&result, &JsValue::from_str("first_address"))
        .expect("missing first_address");
    let changeset = js_sys::Reflect::get(&result, &JsValue::from_str("changeset_json"))
        .expect("missing changeset_json");

    assert!(external.is_string(), "external_descriptor should be string");
    assert!(internal.is_string(), "internal_descriptor should be string");
    assert!(first_address.is_string(), "first_address should be string");
    assert!(changeset.is_string(), "changeset_json should be string");

    let addr = first_address.as_string().unwrap();
    assert!(
        addr.starts_with("tb1"),
        "signet address should start with tb1, got: {addr}"
    );
}

#[wasm_bindgen_test]
fn get_new_address_returns_string_after_wallet_creation() {
    create_test_wallet();
    let address = get_new_address().expect("get_new_address failed");
    assert!(!address.is_empty(), "address should not be empty");
    assert!(
        address.starts_with("tb1"),
        "signet address should start with tb1, got: {address}"
    );
}

#[wasm_bindgen_test]
fn get_balance_returns_jsvalue_after_wallet_creation() {
    create_test_wallet();
    let balance = get_balance().expect("get_balance failed");

    let confirmed =
        js_sys::Reflect::get(&balance, &JsValue::from_str("confirmed")).expect("missing confirmed");
    let total = js_sys::Reflect::get(&balance, &JsValue::from_str("total")).expect("missing total");

    assert!(confirmed.as_f64().is_some(), "confirmed should be a number");
    assert!(total.as_f64().is_some(), "total should be a number");
    assert_eq!(confirmed.as_f64().unwrap(), 0.0);
    assert_eq!(total.as_f64().unwrap(), 0.0);
}

#[wasm_bindgen_test]
fn export_changeset_returns_json_string() {
    create_test_wallet();
    let changeset = export_changeset().expect("export_changeset failed");
    assert!(!changeset.is_empty(), "changeset should not be empty");

    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&changeset);
    assert!(parsed.is_ok(), "changeset should be valid JSON");
}

#[wasm_bindgen_test]
fn build_transaction_fails_without_funds() {
    create_test_wallet();
    let result = bitboard_crypto::build_transaction(
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        10_000,
        1.0,
        "signet",
    );
    assert!(
        result.is_err(),
        "build_transaction should fail without funds"
    );
}

#[wasm_bindgen_test]
fn derive_argon2_key_returns_32_bytes() {
    let salt = b"test_salt_16byte";
    let key = derive_argon2_key("test_password", salt).expect("derive_argon2_key failed");
    assert_eq!(key.len(), 32, "key should be 32 bytes");
}

#[wasm_bindgen_test]
async fn sync_wallet_async_export_is_callable() {
    create_test_wallet();
    let result = bitboard_crypto::sync_wallet("http://localhost:99999").await;
    assert!(
        result.is_err(),
        "sync_wallet with bad URL should return an error, not panic"
    );
}
