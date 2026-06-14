/**
 * Upper bounds for user-supplied Lightning / NWC strings.
 * Mitigates oversized payloads (storage DoS, pathological SDK inputs).
 */
export const MAX_NWC_CONNECTION_STRING_LENGTH = 8192

export const MAX_LIGHTNING_WALLET_LABEL_LENGTH = 128

export const MAX_BOLT11_PAYMENT_REQUEST_LENGTH = 8192

/** Bech32-encoded LNURL strings (lnurl1…). */
export const MAX_LNURL_BECH32_LENGTH = 2048

/** Invoice description for NWC `make_invoice` / BOLT11 `d` field. */
export const MAX_LIGHTNING_INVOICE_DESCRIPTION_LENGTH = 639
