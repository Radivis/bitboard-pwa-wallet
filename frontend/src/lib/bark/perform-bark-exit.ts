import type { BarkExitReview } from '@/lib/bark/review-bark-exit'

export class BarkOffboardParkedError extends Error {
  constructor() {
    super('This exit is still in progress. Sync Bark to continue it.')
    this.name = 'BarkOffboardParkedError'
  }
}

export type PerformBarkExitDeps = {
  sendOnchain: (address: string, amountSats: number) => Promise<string>
  offboardAll: (address: string) => Promise<string>
  syncBark: () => Promise<void>
  startOnchainBackgroundSync: () => void
}

export type PerformedBarkExit = {
  txid: string
  syncWarning: string | null
}

const PARKED_MARKER = 'bark_offboard_parked'

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function submitExit(
  deps: PerformBarkExitDeps,
  review: BarkExitReview,
): Promise<string> {
  try {
    if (review.mode === 'amount') {
      if (review.amountSats == null) {
        throw new Error('Bark exit amount is missing')
      }
      return await deps.sendOnchain(review.destinationAddress, review.amountSats)
    }
    return await deps.offboardAll(review.destinationAddress)
  } catch (err) {
    if (errorText(err).includes(PARKED_MARKER)) {
      throw new BarkOffboardParkedError()
    }
    throw err instanceof Error ? err : new Error(errorText(err))
  }
}

/**
 * Submits a reviewed collaborative exit to Bark.
 * Does not reveal a new on-chain address and does not broadcast through Esplora.
 * A parked exit is not a success: Bark retries it on the next sync.
 */
export async function performBarkExit(
  deps: PerformBarkExitDeps,
  review: BarkExitReview,
): Promise<PerformedBarkExit> {
  const txid = await submitExit(deps, review)
  let syncWarning: string | null = null
  try {
    await deps.syncBark()
  } catch (err) {
    syncWarning = errorText(err)
  }
  deps.startOnchainBackgroundSync()
  return { txid, syncWarning }
}
