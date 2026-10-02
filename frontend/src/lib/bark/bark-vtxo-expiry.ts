import { format } from 'date-fns'

/** Mainnet's target interval. Bark treats 144 blocks as about 24 hours. */
export const BITCOIN_MAINNET_AVERAGE_BLOCK_SECONDS = 10 * 60

/**
 * Second's signet has no published target. Recent blocks there average about
 * 10 minutes, so the approximate date uses that interval.
 */
export const BITCOIN_SIGNET_AVERAGE_BLOCK_SECONDS = 10 * 60

export type BarkBitcoinNetwork = 'signet' | 'mainnet'

export interface BarkVtxoExpiryDisplay {
  blocksLabel: string
  dateLabel: string | null
}

export function averageBitcoinBlockSeconds(networkMode: BarkBitcoinNetwork): number {
  if (networkMode === 'mainnet') return BITCOIN_MAINNET_AVERAGE_BLOCK_SECONDS
  return BITCOIN_SIGNET_AVERAGE_BLOCK_SECONDS
}

export function formatBarkVtxoExpiry(input: {
  expiryHeight: number
  tipHeight: number | null
  networkMode: BarkBitcoinNetwork
  now: Date
}): BarkVtxoExpiryDisplay {
  if (input.tipHeight == null) {
    return { blocksLabel: 'Expiry time unavailable', dateLabel: null }
  }
  const blocksRemaining = input.expiryHeight - input.tipHeight
  const approximateExpiry = new Date(
    input.now.getTime() + blocksRemaining * averageBitcoinBlockSeconds(input.networkMode) * 1000,
  )
  return {
    blocksLabel: blocksRemainingLabel(blocksRemaining),
    dateLabel: `About ${format(approximateExpiry, 'yyyy-MM-dd HH:mm')}`,
  }
}

function blocksRemainingLabel(blocksRemaining: number): string {
  if (blocksRemaining > 1) return `Expires in ${blocksRemaining} blocks`
  if (blocksRemaining === 1) return 'Expires in 1 block'
  if (blocksRemaining === 0) return 'Expires at the current block'
  const blocksOverdue = -blocksRemaining
  if (blocksOverdue === 1) return 'Expired 1 block ago'
  return `Expired ${blocksOverdue} blocks ago`
}
