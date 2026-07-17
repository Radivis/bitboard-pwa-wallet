import {
  parseWasmArkError,
  wasmArkErrorCode,
  wasmArkErrorMessage,
} from '@/lib/shared/wasm-ark-error'

export const OPERATOR_TRUST_PENDING_DIGEST_CHANGED_CODE =
  'operator_trust_pending_digest_changed'

export function isOperatorTrustPendingDigestChangedError(err: unknown): boolean {
  return wasmArkErrorCode(err) === OPERATOR_TRUST_PENDING_DIGEST_CHANGED_CODE
}

export function operatorTrustPendingDigestChangedMessage(err: unknown): string {
  return (
    wasmArkErrorMessage(err) ??
    'The operator published newer configuration while you were reviewing. Please review the updated changes before accepting.'
  )
}

export function parseOperatorTrustPendingDigestChangedError(
  err: unknown,
): { code: string; message: string } | null {
  if (!isOperatorTrustPendingDigestChangedError(err)) {
    return null
  }
  return parseWasmArkError(err)
}
