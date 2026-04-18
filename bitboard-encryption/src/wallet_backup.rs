//! Signed wallet SQLite backup: double SHA-256 of file bytes, ML-DSA-65 over that digest.
//! Signing key seed = Argon2id(password, manifest salt) with backup-specific PHC strings.

use base64::Engine;
use core::convert::TryFrom;
use ml_dsa::{
    KeyGen, MlDsa65, Seed,
    signature::{Keypair, Signer, Verifier},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;

use crate::derive_argon2_key_from_phc_str;

/// Bump when manifest fields, KDF, or signature algorithm change.
pub const WALLET_BACKUP_MANIFEST_FORMAT_VERSION: u32 = 1;

/// Must match verification and user-facing docs.
pub const WALLET_BACKUP_SIGNING_KEY_DERIVATION_ID: &str = "backup_sign_v1";

/// ML-DSA parameter set name stored in manifest.
pub const WALLET_BACKUP_MLDSA_PARAMETER_SET: &str = "ML-DSA-65";

/// Production Argon2id (same `m,t,p` as wallet encryption) with a distinct PHC string for backup signing.
pub const ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_PRODUCTION: &str =
    "$argon2id$v=19$m=65536,t=3,p=4$backup-sign-v1";

/// CI Argon2id profile for tests / dev builds that use `VITE_ARGON2_CI`.
pub const ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI: &str =
    "$argon2id$v=19$m=65536,t=2,p=1$backup-sign-v1";

/// Inner SQLite filename inside the export ZIP.
pub const WALLET_BACKUP_SQLITE_ENTRY_NAME: &str = "bitboard-wallet-backup.sqlite";

/// Manifest filename inside the export ZIP.
pub const WALLET_BACKUP_MANIFEST_ENTRY_NAME: &str = "bitboard-wallet-backup.manifest.json";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct WalletBackupManifest {
    pub format_version: u32,
    pub mldsa_parameter_set: String,
    pub kdf_phc: String,
    pub salt_b64: String,
    pub signing_key_derivation_id: String,
    pub message_hash_hex: String,
    pub signature_b64: String,
}

fn double_sha256_hex(sqlite_bytes: &[u8]) -> String {
    let first = Sha256::digest(sqlite_bytes);
    let second = Sha256::digest(first);
    hex::encode(second)
}

fn double_sha256_bytes(sqlite_bytes: &[u8]) -> [u8; 32] {
    let first = Sha256::digest(sqlite_bytes);
    let second = Sha256::digest(first);
    second.into()
}

fn keypair_from_password(
    password: &str,
    salt: &[u8],
    kdf_phc: &str,
) -> Result<ml_dsa::SigningKey<MlDsa65>, String> {
    let key_bytes = derive_argon2_key_from_phc_str(password, salt, kdf_phc)?;
    if key_bytes.len() != 32 {
        return Err("Unexpected Argon2 output length for ML-DSA seed".to_string());
    }
    let mut seed = Seed::default();
    seed.copy_from_slice(&key_bytes);
    Ok(MlDsa65::from_seed(&seed))
}

/// Builds manifest JSON and signs `double_sha256(sqlite_bytes)` with ML-DSA-65 (deterministic).
pub fn sign_wallet_backup_manifest_inner(
    sqlite_bytes: &[u8],
    password: &str,
    salt: &[u8],
    kdf_phc: &str,
) -> Result<String, String> {
    let message_hash_hex = double_sha256_hex(sqlite_bytes);
    let message_hash = double_sha256_bytes(sqlite_bytes);
    let signing_key = keypair_from_password(password, salt, kdf_phc)?;
    let signature = signing_key
        .try_sign(&message_hash)
        .map_err(|e| format!("ML-DSA sign failed: {e}"))?;
    let sig_bytes = signature.encode();
    let sig_slice: &[u8] = sig_bytes.as_slice();
    let manifest = WalletBackupManifest {
        format_version: WALLET_BACKUP_MANIFEST_FORMAT_VERSION,
        mldsa_parameter_set: WALLET_BACKUP_MLDSA_PARAMETER_SET.to_string(),
        kdf_phc: kdf_phc.to_string(),
        salt_b64: base64::engine::general_purpose::STANDARD.encode(salt),
        signing_key_derivation_id: WALLET_BACKUP_SIGNING_KEY_DERIVATION_ID.to_string(),
        message_hash_hex,
        signature_b64: base64::engine::general_purpose::STANDARD.encode(sig_slice),
    };
    serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())
}

/// Verifies manifest signature and that the message hash matches `sqlite_bytes`.
pub fn verify_wallet_backup_manifest_inner(
    sqlite_bytes: &[u8],
    password: &str,
    manifest_json: &str,
) -> Result<(), String> {
    let manifest: WalletBackupManifest =
        serde_json::from_str(manifest_json).map_err(|e| e.to_string())?;
    if manifest.format_version != WALLET_BACKUP_MANIFEST_FORMAT_VERSION {
        return Err("Unsupported wallet backup manifest format_version".to_string());
    }
    if manifest.mldsa_parameter_set != WALLET_BACKUP_MLDSA_PARAMETER_SET {
        return Err("Unsupported mldsa_parameter_set".to_string());
    }
    if manifest.signing_key_derivation_id != WALLET_BACKUP_SIGNING_KEY_DERIVATION_ID {
        return Err("Unsupported signing_key_derivation_id".to_string());
    }
    if manifest.kdf_phc != ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_PRODUCTION
        && manifest.kdf_phc != ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI
    {
        return Err(
            "Unsupported wallet backup kdf_phc (expected a known backup signing profile)"
                .to_string(),
        );
    }
    let expected_hex = double_sha256_hex(sqlite_bytes);
    if manifest.message_hash_hex != expected_hex {
        return Err(
            "Backup manifest hash does not match SQLite file (file may be corrupted or tampered)"
                .to_string(),
        );
    }
    let salt = base64::engine::general_purpose::STANDARD
        .decode(&manifest.salt_b64)
        .map_err(|_| "Invalid salt_b64 in manifest".to_string())?;
    let signing_key = keypair_from_password(password, &salt, &manifest.kdf_phc)?;
    let vk = signing_key.verifying_key();
    let sig_bytes = base64::engine::general_purpose::STANDARD
        .decode(&manifest.signature_b64)
        .map_err(|_| "Invalid signature_b64 in manifest".to_string())?;
    let sig = ml_dsa::Signature::<MlDsa65>::try_from(sig_bytes.as_slice())
        .map_err(|_| "Invalid ML-DSA signature encoding".to_string())?;
    let message_hash = double_sha256_bytes(sqlite_bytes);
    vk.verify(&message_hash, &sig)
        .map_err(|_| "Invalid password or corrupted backup (signature does not verify)".to_string())
}

/// Builds manifest JSON and signs `double_sha256(sqlite_bytes)` with ML-DSA-65 (deterministic).
#[wasm_bindgen(js_name = signWalletBackupManifest)]
pub fn sign_wallet_backup_manifest(
    sqlite_bytes: &[u8],
    password: &str,
    salt: &[u8],
    kdf_phc: &str,
) -> Result<String, JsValue> {
    sign_wallet_backup_manifest_inner(sqlite_bytes, password, salt, kdf_phc)
        .map_err(|e| JsValue::from_str(&e))
}

/// Verifies manifest signature and that the message hash matches `sqlite_bytes`.
#[wasm_bindgen(js_name = verifyWalletBackupManifest)]
pub fn verify_wallet_backup_manifest(
    sqlite_bytes: &[u8],
    password: &str,
    manifest_json: &str,
) -> Result<(), JsValue> {
    verify_wallet_backup_manifest_inner(sqlite_bytes, password, manifest_json)
        .map_err(|e| JsValue::from_str(&e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_verify_round_trip() {
        let sqlite = b"fake sqlite bytes";
        let salt = [1u8; 16];
        let password = "test-app-password";
        let json = sign_wallet_backup_manifest_inner(
            sqlite,
            password,
            &salt,
            ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI,
        )
        .expect("sign");
        verify_wallet_backup_manifest_inner(sqlite, password, &json).expect("verify");
    }

    #[test]
    fn tampered_sqlite_fails() {
        let sqlite = b"fake sqlite bytes";
        let salt = [1u8; 16];
        let password = "test-app-password";
        let json = sign_wallet_backup_manifest_inner(
            sqlite,
            password,
            &salt,
            ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI,
        )
        .expect("sign");
        let mut bad = sqlite.to_vec();
        bad[0] ^= 1;
        let err = verify_wallet_backup_manifest_inner(&bad, password, &json).unwrap_err();
        assert!(
            err.contains("hash") || err.contains("signature") || err.contains("verify"),
            "unexpected err: {err}"
        );
    }

    #[test]
    fn wrong_password_fails() {
        let sqlite = b"x";
        let salt = [2u8; 16];
        let json = sign_wallet_backup_manifest_inner(
            sqlite,
            "pw-a",
            &salt,
            ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI,
        )
        .expect("sign");
        assert!(verify_wallet_backup_manifest_inner(sqlite, "pw-b", &json).is_err());
    }

    #[test]
    fn rejects_manifest_kdf_phc_not_in_backup_allowlist() {
        let sqlite = b"fake sqlite bytes";
        let salt = [1u8; 16];
        let password = "test-app-password";
        let json = sign_wallet_backup_manifest_inner(
            sqlite,
            password,
            &salt,
            ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI,
        )
        .expect("sign");
        let mut manifest: WalletBackupManifest = serde_json::from_str(&json).expect("parse");
        manifest.kdf_phc = "$argon2id$v=19$m=65536,t=3,p=4".to_string();
        let bad_json = serde_json::to_string(&manifest).expect("serialize");
        let err = verify_wallet_backup_manifest_inner(sqlite, password, &bad_json).unwrap_err();
        assert!(
            err.contains("kdf_phc") || err.contains("Unsupported"),
            "unexpected err: {err}"
        );
    }
}
