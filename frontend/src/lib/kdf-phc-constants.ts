/**
 * Canonical Argon2id PHC parameter prefixes (salt is stored separately in SQLite).
 * Must match {@link ARGON2_KDF_PHC_CI} / {@link ARGON2_KDF_PHC_PRODUCTION} in `bitboard-encryption`.
 */
export const ARGON2_KDF_PHC_CI = '$argon2id$v=19$m=65536,t=2,p=1' as const

export const ARGON2_KDF_PHC_PRODUCTION = '$argon2id$v=19$m=65536,t=3,p=4' as const
