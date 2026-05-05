import { errorMessage } from '@/lib/utils'

const BAD_LOCAL_CHAIN_MARKERS = [
  'HeaderHashNotFound',
  'HeaderHeightNotFound',
] as const

const USER_FACING_MESSAGE =
  'Saved wallet blockchain data does not match data from Esplora. Use Full rescan on the wallet dashboard to repair.'

/**
 * Thrown when Esplora sync indicates the persisted local chain cannot be reconciled with
 * the indexer (e.g. missing block header by hash/height).
 */
export class BadLocalChainStateError extends Error {
  declare readonly cause?: unknown

  constructor(message: string = USER_FACING_MESSAGE, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'BadLocalChainStateError'
  }
}

export function isBadLocalChainStateMessage(detail: string): boolean {
  return BAD_LOCAL_CHAIN_MARKERS.some((m) => detail.includes(m))
}

/**
 * Returns a {@link BadLocalChainStateError} when `err` looks like Esplora local-chain mismatch.
 */
export function asBadLocalChainStateError(err: unknown): BadLocalChainStateError | null {
  if (err instanceof BadLocalChainStateError) {
    return err
  }
  const raw = errorMessage(err)
  if (!isBadLocalChainStateMessage(raw)) {
    return null
  }
  return new BadLocalChainStateError(USER_FACING_MESSAGE, { cause: err })
}
