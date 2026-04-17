/**
 * Wallet backup ZIP layout and signing parameters.
 * Must stay aligned with `bitboard-encryption` / `wallet_backup.rs`.
 */

export const WALLET_BACKUP_MANIFEST_FORMAT_VERSION = 1

export const WALLET_BACKUP_SIGNING_KEY_DERIVATION_ID = 'backup_sign_v1'

export const WALLET_BACKUP_MLDSA_PARAMETER_SET = 'ML-DSA-65'

/** Production Argon2id (same m,t,p as wallet encryption) — distinct PHC string for backup signing only. */
export const ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_PRODUCTION =
  '$argon2id$v=19$m=65536,t=3,p=4$backup-sign-v1' as const

/** CI Argon2id when `VITE_ARGON2_CI=1` (non-production builds only). */
export const ARGON2_KDF_PHC_WALLET_BACKUP_SIGN_CI =
  '$argon2id$v=19$m=65536,t=2,p=1$backup-sign-v1' as const

export const WALLET_BACKUP_SQLITE_ENTRY_NAME = 'bitboard-wallet-backup.sqlite'

export const WALLET_BACKUP_MANIFEST_ENTRY_NAME = 'bitboard-wallet-backup.manifest.json'

export const WALLET_BACKUP_ZIP_FILENAME = 'bitboard-wallet-backup.zip'

export const WALLET_BACKUP_SIGNING_SALT_BYTES = 16
