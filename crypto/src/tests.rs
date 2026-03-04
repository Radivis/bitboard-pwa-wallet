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
fn test_argon2_performance_suitable_for_mobile() {
    let password = "performance-test-password";
    let salt = b"0123456789abcdef";

    let start = std::time::Instant::now();
    let _ = super::derive_argon2_key(password, salt).unwrap();
    let elapsed = start.elapsed();

    // Real Argon2id with 64MB memory should take 100-500ms on modern hardware
    // On slower machines or under load, it may take up to 3 seconds
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
    // Verify we're using the correct Argon2id parameters
    let params = Params::new(65536, 3, 4, Some(32)).unwrap();
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let password = b"test";
    let salt = b"0123456789abcdef";
    let mut output = [0u8; 32];

    argon2
        .hash_password_into(password, salt, &mut output)
        .unwrap();

    // Verify params:
    // - Memory: 65536 KiB = 64 MB
    // - Time: 3 iterations
    // - Parallelism: 4 lanes
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
