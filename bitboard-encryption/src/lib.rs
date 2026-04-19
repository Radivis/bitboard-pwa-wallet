//! Minimal WASM crate for key derivation (Argon2id). Used by the encryption worker only.
//!
//! KDF parameters are identified by PHC-style prefix strings (salt stays separate in the app DB).

mod wallet_backup;

use argon2::{Algorithm, Argon2, Params, Version};
use wasm_bindgen::prelude::*;

pub use wallet_backup::{
    ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI, ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_PRODUCTION,
    WALLET_BACKUP_MANIFEST_ENTRY_NAME, WALLET_BACKUP_MANIFEST_FORMAT_VERSION,
    WALLET_BACKUP_MLDSA_PARAMETER_SET, WALLET_BACKUP_SIGNING_KEY_DERIVATION_ID,
    WALLET_BACKUP_SQLITE_ENTRY_NAME, WalletBackupManifest, sign_wallet_backup_manifest,
    sign_wallet_backup_manifest_inner, verify_wallet_backup_manifest,
    verify_wallet_backup_manifest_inner,
};

/// Memory cost (KiB) for both profiles — 64 MiB.
const ARGON2_MEMORY_KIB: u32 = 65536;
/// Output length for AES-256 key material (bytes).
const DERIVED_KEY_LEN: usize = 32;

/// Production: Argon2 time cost (iterations).
const ARGON2_PRODUCTION_ITERATIONS: u32 = 3;
/// Production: parallelism lanes.
const ARGON2_PRODUCTION_PARALLELISM: u32 = 4;
/// CI: Argon2 time cost (iterations).
const ARGON2_CI_ITERATIONS: u32 = 2;
/// CI: parallelism lanes.
const ARGON2_CI_PARALLELISM: u32 = 1;

/// PHC-style Argon2id descriptor: CI profile (matches former `kdf_version == 1`).
/// `v=19` is Argon2 version 0x13.
pub const ARGON2_KDF_PHC_CI: &str = "$argon2id$v=19$m=65536,t=2,p=1";

/// PHC-style Argon2id descriptor: production profile (matches former `kdf_version == 2`).
pub const ARGON2_KDF_PHC_PRODUCTION: &str = "$argon2id$v=19$m=65536,t=3,p=4";

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
    derive_argon2_key_with_mtp(password, salt, ARGON2_MEMORY_KIB, iterations, parallelism)
}

fn derive_argon2_key_with_mtp(
    password: &str,
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<Vec<u8>, JsValue> {
    derive_argon2_key_with_mtp_str(password, salt, memory_kib, iterations, parallelism)
        .map_err(|e| JsValue::from_str(&e))
}

/// Parses `m=65536,t=2,p=1` from a PHC fragment (no `$` in this segment).
fn parse_mtp_segment(segment: &str) -> Option<(u32, u32, u32)> {
    let mut memory_kib: Option<u32> = None;
    let mut iterations: Option<u32> = None;
    let mut parallelism: Option<u32> = None;
    for part in segment.split(',') {
        let part = part.trim();
        if let Some(v) = part.strip_prefix("m=") {
            memory_kib = v.parse().ok();
        } else if let Some(v) = part.strip_prefix("t=") {
            iterations = v.parse().ok();
        } else if let Some(v) = part.strip_prefix("p=") {
            parallelism = v.parse().ok();
        }
    }
    match (memory_kib, iterations, parallelism) {
        (Some(m), Some(t), Some(p)) => Some((m, t, p)),
        _ => None,
    }
}

const INVALID_KDF_PHC_MSG: &str =
    "Invalid kdf_phc: expected Argon2id PHC with m,t,p (e.g. $argon2id$v=19$m=65536,t=3,p=4)";

/// Same as [`parse_mtp_from_phc`] but with `String` errors (native tests / backup signing).
pub(crate) fn parse_mtp_from_phc_str(phc: &str) -> Result<(u32, u32, u32), &'static str> {
    if phc == ARGON2_KDF_PHC_CI {
        return Ok((
            ARGON2_MEMORY_KIB,
            ARGON2_CI_ITERATIONS,
            ARGON2_CI_PARALLELISM,
        ));
    }
    if phc == ARGON2_KDF_PHC_PRODUCTION {
        return Ok((
            ARGON2_MEMORY_KIB,
            ARGON2_PRODUCTION_ITERATIONS,
            ARGON2_PRODUCTION_PARALLELISM,
        ));
    }
    for segment in phc.split('$') {
        if segment.contains("m=")
            && segment.contains("t=")
            && segment.contains("p=")
            && let Some(mtp) = parse_mtp_segment(segment)
        {
            return Ok(mtp);
        }
    }
    Err(INVALID_KDF_PHC_MSG)
}

fn derive_argon2_key_with_mtp_str(
    password: &str,
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<Vec<u8>, String> {
    let params = Params::new(memory_kib, iterations, parallelism, Some(DERIVED_KEY_LEN))
        .map_err(|e| format!("Argon2 params error: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = vec![0u8; DERIVED_KEY_LEN];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Argon2 hash error: {e}"))?;
    Ok(key)
}

/// Derive a 256-bit key from password, salt, and PHC (string errors — used by wallet backup and unit tests).
pub(crate) fn derive_argon2_key_from_phc_str(
    password: &str,
    salt: &[u8],
    phc: &str,
) -> Result<Vec<u8>, String> {
    let (memory_kib, iterations, parallelism) =
        parse_mtp_from_phc_str(phc).map_err(String::from)?;
    derive_argon2_key_with_mtp_str(password, salt, memory_kib, iterations, parallelism)
}

/// Derive a 256-bit key from password, salt, and a PHC-style Argon2id parameter string.
#[wasm_bindgen(js_name = deriveArgon2KeyFromPhc)]
pub fn derive_argon2_key_from_phc(
    password: &str,
    salt: &[u8],
    phc: &str,
) -> Result<Vec<u8>, JsValue> {
    derive_argon2_key_from_phc_str(password, salt, phc).map_err(|e| JsValue::from_str(&e))
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
    fn phc_ci_matches_derive_argon2_key_ci() {
        let password = "pw";
        let salt = [7u8; 16];
        let a = derive_argon2_key_ci(password, &salt).unwrap();
        let b = derive_argon2_key_from_phc(password, &salt, ARGON2_KDF_PHC_CI).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn phc_production_matches_derive_argon2_key() {
        let password = "pw";
        let salt = [7u8; 16];
        let a = derive_argon2_key(password, &salt).unwrap();
        let b = derive_argon2_key_from_phc(password, &salt, ARGON2_KDF_PHC_PRODUCTION).unwrap();
        assert_eq!(a, b);
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
