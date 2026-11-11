import type { NetworkMode } from '@/stores/walletStore'
import {
  durationUnit,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from '@/lib/shared/format-duration'

/** Target interval on mainnet, signet, and testnet. */
const TEN_MINUTE_BLOCK_SECONDS = 10 * SECONDS_PER_MINUTE

/** Mutinynet's published target. */
const MUTINYNET_BLOCK_SECONDS = 30

export type BlockDurationParts = {
  blockCount: number
  days: number
  hours: number
  minutes: number
  seconds: number
}

function averageBlockSeconds(networkMode: NetworkMode | null | undefined): number | null {
  if (networkMode === 'mainnet' || networkMode === 'signet' || networkMode === 'testnet') {
    return TEN_MINUTE_BLOCK_SECONDS
  }
  if (networkMode === 'mutinynet') return MUTINYNET_BLOCK_SECONDS
  return null
}

function wholeBlockCount(blockCount: number): number {
  if (!Number.isFinite(blockCount)) return 0
  return Math.max(0, Math.floor(blockCount))
}

/** Split a block count into days, hours, minutes, and seconds at the network's block interval. */
export function blockDurationParts(
  blockCount: number,
  networkMode: NetworkMode | null | undefined,
): BlockDurationParts {
  const count = wholeBlockCount(blockCount)
  const intervalSeconds = averageBlockSeconds(networkMode)
  if (intervalSeconds == null) {
    return { blockCount: count, days: 0, hours: 0, minutes: 0, seconds: 0 }
  }

  let remainingSeconds = count * intervalSeconds
  const days = Math.floor(remainingSeconds / SECONDS_PER_DAY)
  remainingSeconds -= days * SECONDS_PER_DAY
  const hours = Math.floor(remainingSeconds / SECONDS_PER_HOUR)
  remainingSeconds -= hours * SECONDS_PER_HOUR
  const minutes = Math.floor(remainingSeconds / SECONDS_PER_MINUTE)
  const seconds = remainingSeconds - minutes * SECONDS_PER_MINUTE
  return { blockCount: count, days, hours, minutes, seconds }
}

/**
 * Days, hours, and minutes for display. Seconds stay off the phrase.
 * `null` when the network has no target interval, or the estimate is zero.
 */
export function formatApproximateDurationPhrase(parts: BlockDurationParts): string | null {
  const pieces: string[] = []
  if (parts.days > 0) pieces.push(durationUnit(parts.days, 'day'))
  if (parts.hours > 0) pieces.push(durationUnit(parts.hours, 'hour'))
  if (parts.minutes > 0) pieces.push(durationUnit(parts.minutes, 'minute'))
  if (pieces.length === 0) {
    return parts.seconds > 0 ? 'less than a minute' : null
  }
  if (pieces.length === 1) return pieces[0] ?? null
  const last = pieces[pieces.length - 1]
  const earlier = pieces.slice(0, -1)
  if (earlier.length === 1) return `${earlier[0]} and ${last}`
  return `${earlier.join(', ')}, and ${last}`
}
