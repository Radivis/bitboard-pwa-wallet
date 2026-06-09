export type WasmArkErrorPayload = { code: string; message: string }

function isWasmArkErrorPayload(value: unknown): value is WasmArkErrorPayload {
  if (value == null || typeof value !== 'object') return false
  if (value instanceof Error) return false
  const record = value as Record<string, unknown>
  return typeof record.code === 'string' && typeof record.message === 'string'
}

function parseJsonWasmArkErrorPayload(raw: string): WasmArkErrorPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isWasmArkErrorPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function parseWasmArkError(err: unknown): WasmArkErrorPayload | null {
  if (isWasmArkErrorPayload(err)) return err

  if (err instanceof Error) {
    const withCode = err as Error & { code?: unknown }
    if (typeof withCode.code === 'string' && err.message.length > 0) {
      return { code: withCode.code, message: err.message }
    }
    const fromMessage = parseJsonWasmArkErrorPayload(err.message)
    if (fromMessage != null) return fromMessage
  }

  return null
}

export function wasmArkErrorCode(err: unknown): string | null {
  return parseWasmArkError(err)?.code ?? null
}

export function wasmArkErrorMessage(err: unknown): string | null {
  return parseWasmArkError(err)?.message ?? null
}

/**
 * Re-throw a WASM/Ark failure so Comlink preserves `code` on the main thread.
 */
export function rethrowWasmArkErrorForComlink(err: unknown): never {
  const payload = parseWasmArkError(err)
  if (payload != null) {
    throw new Error(JSON.stringify(payload))
  }
  throw err
}
