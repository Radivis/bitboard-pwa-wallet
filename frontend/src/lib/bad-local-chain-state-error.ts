import { errorMessage } from '@/lib/utils'

const BAD_LOCAL_CHAIN_MARKERS = [
  'HeaderHashNotFound',
  'HeaderHeightNotFound',
] as const

/**
 * Matches `Debug`/`Display` snippets from the WASM/blockchain worker. If upstream renames these
 * variants, update markers and `bad-local-chain-state-error.test.ts`.
 * Prefer structured error codes from the worker when that layer exposes them.
 */
export function isBadLocalChainStateMessage(detail: string): boolean {
  return BAD_LOCAL_CHAIN_MARKERS.some((m) => detail.includes(m))
}

/** Single line explaining that persisted chain and Esplora disagree. */
const BAD_LOCAL_CHAIN_ESPLORA_MISMATCH =
  'Saved wallet blockchain data does not match data from Esplora.'

/** Shared UX anchor for the dashboard repair action (keep toast and error text aligned). */
export const BAD_LOCAL_CHAIN_FULL_RESCAN_ACTION =
  'Full rescan on the wallet dashboard'

const USER_FACING_MESSAGE = `${BAD_LOCAL_CHAIN_ESPLORA_MISMATCH} Use ${BAD_LOCAL_CHAIN_FULL_RESCAN_ACTION} to repair.`

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
