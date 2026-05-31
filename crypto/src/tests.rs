// --- CryptoError unit tests (message shape and From impls) ---
// Argon2/KDF tests live in the bitboard-encryption crate.

mod error_tests {
    use crate::error::CryptoError;

    #[test]
    fn crypto_error_variants_display_expected_prefix() {
        assert!(
            CryptoError::Mnemonic("msg".into())
                .to_string()
                .contains("Mnemonic"),
            "Mnemonic variant must mention Mnemonic"
        );
        assert!(
            CryptoError::Descriptor("msg".into())
                .to_string()
                .contains("Descriptor"),
            "Descriptor variant must mention Descriptor"
        );
        assert!(
            CryptoError::Wallet("msg".into())
                .to_string()
                .contains("Wallet"),
            "Wallet variant must mention Wallet"
        );
        assert!(
            CryptoError::Blockchain("msg".into())
                .to_string()
                .contains("Blockchain"),
            "Blockchain variant must mention Blockchain"
        );
        assert!(
            CryptoError::Transaction("msg".into())
                .to_string()
                .contains("Transaction"),
            "Transaction variant must mention Transaction"
        );
        assert!(
            CryptoError::Serialization("msg".into())
                .to_string()
                .contains("Serialization"),
            "Serialization variant must mention Serialization"
        );
    }

    #[test]
    fn crypto_error_variants_include_inner_message() {
        let msg = "inner detail";
        let display_string = CryptoError::Blockchain(msg.to_string()).to_string();
        assert!(
            display_string.contains(msg),
            "Display must include inner message: {}",
            display_string
        );
    }

    #[test]
    fn crypto_error_from_serde_json_produces_serialization() {
        let bad_json = serde_json::from_str::<()>("{ invalid }").unwrap_err();
        let crypto_err: CryptoError = bad_json.into();
        let display_string = crypto_err.to_string();
        assert!(
            display_string.contains("Serialization"),
            "serde_json::Error must map to Serialization: {}",
            display_string
        );
    }

    #[test]
    fn crypto_error_code_maps_variants() {
        use crate::error::{
            CODE_BLOCKCHAIN, CODE_DESCRIPTOR, CODE_MNEMONIC, CODE_SERIALIZATION, CODE_TRANSACTION,
            CODE_WALLET, CryptoError,
        };

        assert_eq!(CryptoError::Mnemonic("x".into()).code(), CODE_MNEMONIC);
        assert_eq!(CryptoError::Descriptor("x".into()).code(), CODE_DESCRIPTOR);
        assert_eq!(CryptoError::Wallet("x".into()).code(), CODE_WALLET);
        assert_eq!(CryptoError::Blockchain("x".into()).code(), CODE_BLOCKCHAIN);
        assert_eq!(
            CryptoError::Transaction("x".into()).code(),
            CODE_TRANSACTION
        );
        assert_eq!(
            CryptoError::Serialization("x".into()).code(),
            CODE_SERIALIZATION
        );
    }

    #[test]
    fn crypto_error_to_js_payload_shape() {
        use crate::error::{CryptoError, WasmCryptoErrorPayload};

        let error = CryptoError::Mnemonic("bad words".into());
        let payload = error.to_wasm_payload();
        let json = serde_json::to_string(&payload).expect("payload must serialize");
        let parsed: serde_json::Value =
            serde_json::from_str(&json).expect("payload must deserialize as JSON");
        assert_eq!(parsed["code"], "mnemonic");
        assert!(
            parsed["message"]
                .as_str()
                .unwrap_or_default()
                .contains("Mnemonic")
        );
        assert!(
            parsed["message"]
                .as_str()
                .unwrap_or_default()
                .contains("bad words")
        );

        let _typed: WasmCryptoErrorPayload = payload;
    }

    #[test]
    fn map_err_to_js_crypto_error_uses_code() {
        use crate::error::CryptoError;

        let error = CryptoError::Transaction("insufficient funds".into());
        let payload = error.to_wasm_payload();
        assert_eq!(payload.code, "transaction");
        assert!(payload.message.contains("Transaction"));
        assert!(payload.message.contains("insufficient funds"));
        // MapErrToJs -> JsValue shape is validated in wasm_boundary_tests; native tests gate code mapping.
    }
}
