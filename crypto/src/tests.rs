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
        let s = CryptoError::Blockchain(msg.to_string()).to_string();
        assert!(s.contains(msg), "Display must include inner message: {}", s);
    }

    #[test]
    fn crypto_error_from_serde_json_produces_serialization() {
        let bad_json = serde_json::from_str::<()>("{ invalid }").unwrap_err();
        let crypto_err: CryptoError = bad_json.into();
        let s = crypto_err.to_string();
        assert!(
            s.contains("Serialization"),
            "serde_json::Error must map to Serialization: {}",
            s
        );
    }

    // CryptoError -> JsValue is exercised in wasm_boundary_tests (browser); JsValue is not
    // implemented on non-WASM targets so we cannot test it here.
}
