import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { wasmCryptoErrorMessage } from '@/lib/shared/wasm-crypto-error'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalize unknown errors to a string for user-facing or log messages. */
export function errorMessage(err: unknown): string {
  const wasmMessage = wasmCryptoErrorMessage(err)
  if (wasmMessage != null) return wasmMessage
  return err instanceof Error ? err.message : String(err)
}
