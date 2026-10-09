export type WasmArkadeErrorPayload = { code: string; message: string }

function isWasmArkadeErrorPayload(value: unknown): value is WasmArkadeErrorPayload {
  if (value == null || typeof value !== 'object') return false
  if (value instanceof Error) return false
  const record = value as Record<string, unknown>
  return typeof record.code === 'string' && typeof record.message === 'string'
}

function parseJsonWasmArkadeErrorPayload(raw: string): WasmArkadeErrorPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isWasmArkadeErrorPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function parseWasmArkadeError(err: unknown): WasmArkadeErrorPayload | null {
  if (isWasmArkadeErrorPayload(err)) return err

  if (err instanceof Error) {
    const withCode = err as Error & { code?: unknown }
    if (typeof withCode.code === 'string' && err.message.length > 0) {
      return { code: withCode.code, message: err.message }
    }
    const fromMessage = parseJsonWasmArkadeErrorPayload(err.message)
    if (fromMessage != null) return fromMessage
  }

  return null
}

export function wasmArkadeErrorCode(err: unknown): string | null {
  return parseWasmArkadeError(err)?.code ?? null
}

export function wasmArkadeErrorMessage(err: unknown): string | null {
  return parseWasmArkadeError(err)?.message ?? null
}

/**
 * Re-throw a WASM/Arkade failure so Comlink preserves `code` on the main thread.
 */
export function rethrowWasmArkadeErrorForComlink(err: unknown): never {
  const payload = parseWasmArkadeError(err)
  if (payload != null) {
    throw new Error(JSON.stringify(payload))
  }
  throw err
}
