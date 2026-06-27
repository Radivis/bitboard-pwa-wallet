import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { wasmArkErrorMessage } from '@/lib/shared/wasm-ark-error'
import { wasmCryptoErrorMessage } from '@/lib/shared/wasm-crypto-error'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalize unknown errors to a string for user-facing or log messages. */
export function errorMessage(err: unknown): string {
  const wasmMessage = wasmCryptoErrorMessage(err)
  if (wasmMessage != null) return wasmMessage
  const arkMessage = wasmArkErrorMessage(err)
  if (arkMessage != null) return arkMessage
  return err instanceof Error ? err.message : String(err)
}

/** Safe toast/banner text: structured WASM message plus URL/path stripping and length cap. */
export function userFacingErrorMessage(err: unknown): string {
  return sanitizeErrorMessageForUi(errorMessage(err))
}

/** Like {@link userFacingErrorMessage} but supplies a default when sanitization yields empty. */
export function userFacingLifecycleErrorMessage(
  err: unknown,
  fallback: string,
): string {
  return userFacingErrorMessage(err) || fallback
}

export const LIFECYCLE_LOAD_ERROR_FALLBACK = 'Load failed'
export const LIFECYCLE_SYNC_ERROR_FALLBACK = 'Sync failed'
export const LIFECYCLE_SAVE_ERROR_FALLBACK = 'Save failed'
