import type { BarkBalanceParts } from '@/workers/bark-api'

/** `{ spendableSats, lockedSats }` from `bark_balance`, as JSON or an object. */
export function readBarkBalance(value: unknown): BarkBalanceParts {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      throw new Error('Bark balance was not JSON')
    }
  }
  if (parsed == null || typeof parsed !== 'object') {
    throw new Error('Bark balance was not an object')
  }
  const row = parsed as Record<string, unknown>
  return {
    spendableSats: readNonNegativeSats(row.spendableSats, 'spendable'),
    lockedSats: readNonNegativeSats(row.lockedSats, 'locked'),
  }
}

function readNonNegativeSats(value: unknown, label: string): number {
  const sats = typeof value === 'bigint' || typeof value === 'number' ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(sats) || sats < 0) {
    throw new Error(`Bark balance ${label} sats are not a satoshi count`)
  }
  return sats
}

/** Accepts the `u64` wasm-bindgen returns as a bigint, or a safe integer number. */
export function readBarkSpendableSats(value: unknown): number {
  const spendableSats =
    typeof value === 'bigint' || typeof value === 'number' ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(spendableSats) || spendableSats < 0) {
    throw new Error('Bark balance is not a spendable satoshi count')
  }
  return spendableSats
}
