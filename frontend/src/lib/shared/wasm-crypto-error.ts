export type WasmCryptoErrorPayload = { code: string; message: string }

function isWasmCryptoErrorPayload(value: unknown): value is WasmCryptoErrorPayload {
  if (value == null || typeof value !== 'object') return false
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
