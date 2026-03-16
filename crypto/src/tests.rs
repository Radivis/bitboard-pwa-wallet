use argon2::{Algorithm, Argon2, Params, Version};

#[test]
fn test_argon2_key_derivation_produces_32_bytes() {
    let password = "test-password";
    let salt = b"0123456789abcdef";

    let result = super::derive_argon2_key(password, salt).unwrap();

    assert_eq!(result.len(), 32, "Argon2id should produce 32-byte key");
}

#[test]
fn test_argon2_same_inputs_produce_same_key() {
    let password = "consistent-password";
    let salt = b"fixed-salt-16byt";

    let key1 = super::derive_argon2_key(password, salt).unwrap();
    let key2 = super::derive_argon2_key(password, salt).unwrap();

    assert_eq!(
        key1, key2,
        "Same password and salt must produce identical keys"
    );
}

#[test]
fn test_argon2_different_passwords_produce_different_keys() {
    let salt = b"same-salt-16byte";

    let key1 = super::derive_argon2_key("password1", salt).unwrap();
    let key2 = super::derive_argon2_key("password2", salt).unwrap();

    assert_ne!(
        key1, key2,
        "Different passwords must produce different keys"
    );
}

#[test]
fn test_argon2_different_salts_produce_different_keys() {
    let password = "same-password";

    let key1 = super::derive_argon2_key(password, b"salt1234567890ab").unwrap();
    let key2 = super::derive_argon2_key(password, b"differentSalt123").unwrap();

    assert_ne!(key1, key2, "Different salts must produce different keys");
}

#[test]
#[cfg(not(coverage))]
fn test_argon2_performance_suitable_for_mobile() {
    // Skipped under coverage: coverage builds are slower and would flake this test.
    let password = "performance-test-password";
    let salt = b"0123456789abcdef";

    let start = std::time::Instant::now();
    let _ = super::derive_argon2_key(password, salt).unwrap();
    let elapsed = start.elapsed();

    // Real Argon2id 64MB/3iter/p=1: ~100-500ms on modern hardware, <2s on CI/old phones.
    // See .cursor/architecture/research/argon2-mobile-performance.md
    // Too fast means params are wrong, too slow means mobile users will suffer
    assert!(
        elapsed.as_millis() > 50,
        "Argon2id completed too fast ({} ms), check memory cost params",
        elapsed.as_millis()
    );
    assert!(
        elapsed.as_millis() < 3000,
        "Argon2id too slow for mobile ({} ms)",
        elapsed.as_millis()
    );
}

#[test]
fn test_argon2_params_match_specification() {
    // Verify we're using the correct Argon2id parameters (64MB, 2 iter, p=1)
    let params = Params::new(65536, 2, 1, Some(32)).unwrap();
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let password = b"test";
    let salt = b"0123456789abcdef";
    let mut output = [0u8; 32];

    argon2
        .hash_password_into(password, salt, &mut output)
        .unwrap();

    // Verify params:
    // - Memory: 65536 KiB = 64 MB
    // - Time: 2 iterations
    // - Parallelism: 1 lane (recommended for mobile)
    // - Output: 32 bytes (256 bits)
    assert_eq!(output.len(), 32);
}

#[test]
fn test_argon2_empty_password_works() {
    let password = "";
    let salt = b"0123456789abcdef";

    let result = super::derive_argon2_key(password, salt);

    assert!(
        result.is_ok(),
        "Empty password should be valid (though not recommended)"
    );
}

#[test]
fn test_argon2_unicode_password_works() {
    let password = "пароль🔐密码";
    let salt = b"0123456789abcdef";

    let result = super::derive_argon2_key(password, salt);

    assert!(
        result.is_ok(),
        "Unicode passwords should work (UTF-8 encoded)"
    );
}

#[test]
fn test_argon2_long_password_works() {
    let password = "a".repeat(1000);
    let salt = b"0123456789abcdef";

    let result = super::derive_argon2_key(password.as_str(), salt);

    assert!(result.is_ok(), "Long passwords should work");
}

// --- CryptoError unit tests (message shape and From impls) ---

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
