//! Minimal WASM crate for key derivation (Argon2id). Used by the encryption worker only.
//!
//! Parameters must match the original crypto crate for backward compatibility with
//! existing encrypted wallet data: 64 MB memory, 2 iterations, parallelism 1, 32-byte output.

use argon2::{Algorithm, Argon2, Params, Version};
use wasm_bindgen::prelude::*;

/// Derive a 256-bit key from a password and salt using Argon2id.
///
/// Parameters: 64 MB memory, 2 iterations, parallelism 1.
/// Must match the former crypto crate for compatibility with existing encrypted data.
#[wasm_bindgen]
pub fn derive_argon2_key(password: &str, salt: &[u8]) -> Result<Vec<u8>, JsValue> {
    let params = Params::new(65536, 2, 1, Some(32))
        .map_err(|e| JsValue::from_str(&format!("Argon2 params error: {e}")))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = vec![0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| JsValue::from_str(&format!("Argon2 hash error: {e}")))?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_returns_32_bytes() {
        let password = "test_password";
        let salt: [u8; 16] = [42; 16];
        let key = derive_argon2_key(password, &salt).expect("derive_argon2_key failed");
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn same_inputs_produce_same_output() {
        let password = "test_password";
        let salt: [u8; 16] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
        let key1 = derive_argon2_key(password, &salt).unwrap();
        let key2 = derive_argon2_key(password, &salt).unwrap();
        assert_eq!(key1, key2);
    }

    #[test]
    fn different_passwords_produce_different_output() {
        let salt: [u8; 16] = [0; 16];
        let key1 = derive_argon2_key("password1", &salt).unwrap();
        let key2 = derive_argon2_key("password2", &salt).unwrap();
        assert_ne!(key1, key2);
    }

    #[test]
    fn different_salts_produce_different_output() {
        let password = "password";
        let salt1 = b"salt1234567890ab";
        let salt2 = b"differentSalt123";
        let key1 = derive_argon2_key(password, salt1).unwrap();
        let key2 = derive_argon2_key(password, salt2).unwrap();
        assert_ne!(key1, key2);
    }
}
