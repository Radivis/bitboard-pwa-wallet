import { errorMessage } from '@/lib/shared/utils'

const PERSISTED_CHAIN_MISMATCH_MARKERS = [
  'Network mismatch',
  'Genesis hash mismatch',
  'could not be loaded from changeset',
] as const

export function isPersistedChainMismatchError(err: unknown): boolean {
  const detail = errorMessage(err) ?? String(err)
  return PERSISTED_CHAIN_MISMATCH_MARKERS.some((marker) =>
    detail.includes(marker),
  )
}

/**
 * Retries `operation` with `useEmptyChain: true` when BDK rejects a persisted changeset
 * that does not match the target network (shared by load-wallet and session-open paths).
 */
export async function withPersistedChainMismatchRetry<
  T,
  P extends { useEmptyChain: boolean },
>(
  operation: (params: P) => Promise<T>,
  params: P,
): Promise<{ result: T; usedEmptyChainFallback: boolean }> {
  try {
    const result = await operation(params)
    return { result, usedEmptyChainFallback: false }
  } catch (err) {
    if (params.useEmptyChain) throw err
    if (!isPersistedChainMismatchError(err)) throw err
    const result = await operation({ ...params, useEmptyChain: true })
    return { result, usedEmptyChainFallback: true }
  }
}
