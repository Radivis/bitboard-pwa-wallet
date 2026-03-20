//! Minimal WASM crate for key derivation (Argon2id). Used by the encryption worker only.
//!
//! Two parameter sets:
//! - **Production:** 64 MB memory, 3 iterations, parallelism 4 (stronger, for real devices).
//! - **CI** 64 MB memory, 2 iterations, parallelism 1 (faster, for CI).

use argon2::{Algorithm, Argon2, Params, Version};
use wasm_bindgen::prelude::*;

/// Memory cost (KiB) for both profiles — 64 MiB.
const ARGON2_MEMORY_KIB: u32 = 65536;
/// Production: Argon2 time cost (iterations).
const ARGON2_PRODUCTION_ITERATIONS: u32 = 3;
/// Production: parallelism lanes.
const ARGON2_PRODUCTION_PARALLELISM: u32 = 4;
/// CI: Argon2 time cost (iterations).
const ARGON2_CI_ITERATIONS: u32 = 2;
/// CI: parallelism lanes.
const ARGON2_CI_PARALLELISM: u32 = 1;
/// Output length for AES-256 key material (bytes).
const DERIVED_KEY_LEN: usize = 32;

#[derive(Clone, Copy)]
enum Argon2Profile {
    Production,
    Ci,
}

fn derive_argon2_key_with_profile(
    password: &str,
    salt: &[u8],
    profile: Argon2Profile,
) -> Result<Vec<u8>, JsValue> {
    let (iterations, parallelism) = match profile {
        Argon2Profile::Production => (ARGON2_PRODUCTION_ITERATIONS, ARGON2_PRODUCTION_PARALLELISM),
        Argon2Profile::Ci => (ARGON2_CI_ITERATIONS, ARGON2_CI_PARALLELISM),
    };
    let params = Params::new(
        ARGON2_MEMORY_KIB,
        iterations,
        parallelism,
        Some(DERIVED_KEY_LEN),
    )
    .map_err(|e| JsValue::from_str(&format!("Argon2 params error: {e}")))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = vec![0u8; DERIVED_KEY_LEN];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| JsValue::from_str(&format!("Argon2 hash error: {e}")))?;
    Ok(key)
}

/// Derive a 256-bit key using Argon2id with **production** parameters.
/// 64 MB memory, 3 iterations, parallelism 4, 32-byte output.
#[wasm_bindgen]
pub fn derive_argon2_key(password: &str, salt: &[u8]) -> Result<Vec<u8>, JsValue> {
    derive_argon2_key_with_profile(password, salt, Argon2Profile::Production)
}

/// Derive a 256-bit key using Argon2id with **CI** parameters.
/// 64 MB memory, 2 iterations, parallelism 1, 32-byte output.
/// Used for decryption of existing data and for encryption when running in CI.
#[wasm_bindgen]
pub fn derive_argon2_key_ci(password: &str, salt: &[u8]) -> Result<Vec<u8>, JsValue> {
    derive_argon2_key_with_profile(password, salt, Argon2Profile::Ci)
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
