import type { BarkOffboardReview } from '@/lib/bark/review-bark-offboard'

export class BarkOffboardParkedError extends Error {
  constructor() {
    super('This exit is still in progress. Sync Bark to continue it.')
    this.name = 'BarkOffboardParkedError'
  }
}

export type PerformBarkOffboardDeps = {
  sendOnchain: (address: string, amountSats: number) => Promise<string>
  offboardAll: (address: string) => Promise<string>
  syncBark: () => Promise<void>
  startOnchainBackgroundSync: () => void
}

export type PerformedBarkOffboard = {
  txid: string
  syncWarning: string | null
}

const PARKED_MARKER = 'bark_offboard_parked'

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function submitOffboard(
  deps: PerformBarkOffboardDeps,
  review: BarkOffboardReview,
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
 * Submits a reviewed offboard to Bark.
 * Does not reveal a new on-chain address and does not broadcast through Esplora.
 * A parked offboard is not a success: Bark retries it on the next sync.
 */
export async function performBarkOffboard(
  deps: PerformBarkOffboardDeps,
  review: BarkOffboardReview,
): Promise<PerformedBarkOffboard> {
  const txid = await submitOffboard(deps, review)
  let syncWarning: string | null = null
  try {
    await deps.syncBark()
  } catch (err) {
    syncWarning = errorText(err)
  }
  deps.startOnchainBackgroundSync()
  return { txid, syncWarning }
}
