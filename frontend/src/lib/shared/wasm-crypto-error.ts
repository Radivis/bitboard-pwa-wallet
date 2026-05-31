export type WasmCryptoErrorPayload = { code: string; message: string }

/** Matches Rust `MSG_NO_ACTIVE_WALLET` in `crypto/src/error.rs`. */
export const NO_ACTIVE_WALLET_WASM_MESSAGE =
  'No active wallet. Call create_wallet or load_wallet first.'

export const WASM_CRYPTO_ERROR_CODE_NO_ACTIVE_WALLET = 'no_active_wallet'

function isWasmCryptoErrorPayload(value: unknown): value is WasmCryptoErrorPayload {
  if (value == null || typeof value !== 'object') return false
  if (value instanceof Error) return false
  const record = value as Record<string, unknown>
  return typeof record.code === 'string' && typeof record.message === 'string'
}

function parseJsonWasmCryptoErrorPayload(raw: string): WasmCryptoErrorPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isWasmCryptoErrorPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function parseWasmCryptoError(err: unknown): WasmCryptoErrorPayload | null {
  if (isWasmCryptoErrorPayload(err)) return err

  if (err instanceof Error) {
    const withCode = err as Error & { code?: unknown }
    if (typeof withCode.code === 'string' && err.message.length > 0) {
      return { code: withCode.code, message: err.message }
    }
    const fromMessage = parseJsonWasmCryptoErrorPayload(err.message)
    if (fromMessage != null) return fromMessage
  }

  return null
}

export function wasmCryptoErrorCode(err: unknown): string | null {
  return parseWasmCryptoError(err)?.code ?? null
}

export function wasmCryptoErrorMessage(err: unknown): string | null {
  return parseWasmCryptoError(err)?.message ?? null
}

/** True when persisting/exporting without a loaded wallet is expected and safe to ignore. */
export function isBenignNoActiveWalletError(err: unknown): boolean {
  if (wasmCryptoErrorCode(err) === WASM_CRYPTO_ERROR_CODE_NO_ACTIVE_WALLET) {
    return true
  }
  return errorMessageIncludesNoActiveWallet(err)
}

function errorMessageIncludesNoActiveWallet(err: unknown): boolean {
  const message = wasmCryptoErrorMessage(err)
  if (message != null) return message.includes(NO_ACTIVE_WALLET_WASM_MESSAGE)
  if (err instanceof Error) return err.message.includes(NO_ACTIVE_WALLET_WASM_MESSAGE)
  return String(err).includes(NO_ACTIVE_WALLET_WASM_MESSAGE)
}

/**
 * Re-throw a WASM/crypto failure so Comlink preserves `code` on the main thread.
 * wasm-bindgen often throws plain objects; Comlink forwards Error `message` only, not extra fields.
 */
export function rethrowWasmCryptoErrorForComlink(err: unknown): never {
  const payload = parseWasmCryptoError(err)
  if (payload != null) {
    throw new Error(JSON.stringify(payload))
  }
  throw err
}
