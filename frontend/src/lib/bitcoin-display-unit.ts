import { MAX_SAFE_SATS } from '@/lib/bitcoin-utils'

const SATS_PER_BTC = 100_000_000

/** Code uses `uBTC`; UI labels use µBTC. */
export type BitcoinDisplayUnit = 'BTC' | 'mBTC' | 'uBTC' | 'sat' | 'ksat'

export const BITCOIN_DISPLAY_UNITS: readonly BitcoinDisplayUnit[] = [
  'BTC',
  'mBTC',
  'uBTC',
  'ksat',
  'sat',
] as const

/** Short labels for selects and inline unit display. */
export const BITCOIN_DISPLAY_UNIT_LABEL: Record<BitcoinDisplayUnit, string> = {
  BTC: 'BTC',
  mBTC: 'mBTC',
  uBTC: 'µBTC',
  sat: 'sat',
  ksat: 'ksat',
}

const SATS_PER_mBTC = 100_000
const SATS_PER_uBTC = 100
const SATS_PER_ksat = 1_000

function clampSats(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(Math.floor(n), MAX_SAFE_SATS)
}

/**
 * Formats an integer satoshi amount for display in the given unit.
 */
export function formatAmountInBitcoinDisplayUnit(
  sats: number,
  unit: BitcoinDisplayUnit,
): string {
  const s = Number.isFinite(sats) && sats >= 0 ? sats : 0
  switch (unit) {
    case 'BTC':
      return (s / SATS_PER_BTC).toFixed(8)
    case 'mBTC':
      return (s / SATS_PER_mBTC).toFixed(5)
    case 'uBTC':
      return (s / SATS_PER_uBTC).toFixed(2)
    case 'sat':
      return Math.floor(s).toLocaleString()
    case 'ksat':
      return (s / SATS_PER_ksat).toFixed(3)
    default: {
      const _exhaustive: never = unit
      return _exhaustive
    }
  }
}

/**
 * Parses a user-entered decimal string to satoshis for the given unit.
 * Mirrors legacy `amountSatsFromForm` behavior: empty → 0, clamped to safe range.
 */
export function parseAmountToSatsFromBitcoinDisplayUnit(
  amountStr: string,
  unit: BitcoinDisplayUnit,
): number {
  if (typeof amountStr !== 'string' || amountStr.trim() === '') {
    return 0
  }
  const trimmed = amountStr.trim()
  switch (unit) {
    case 'BTC': {
      const parsed = parseFloat(trimmed)
      if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
        return 0
      }
      return clampSats(parsed * SATS_PER_BTC)
    }
    case 'mBTC': {
      const parsed = parseFloat(trimmed)
      if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
        return 0
      }
      return clampSats(parsed * SATS_PER_mBTC)
    }
    case 'uBTC': {
      const parsed = parseFloat(trimmed)
      if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
        return 0
      }
      return clampSats(parsed * SATS_PER_uBTC)
    }
    case 'ksat': {
      const parsed = parseFloat(trimmed)
      if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
        return 0
      }
      return clampSats(parsed * SATS_PER_ksat)
    }
    case 'sat': {
      const normalized = trimmed.replace(/,/g, '')
      const parsed = parseInt(normalized, 10)
      if (Number.isNaN(parsed) || parsed < 0) {
        return 0
      }
      return clampSats(parsed)
    }
    default: {
      const _exhaustive: never = unit
      return _exhaustive
    }
  }
}

export function isBitcoinDisplayUnit(value: unknown): value is BitcoinDisplayUnit {
  return (
    typeof value === 'string' &&
    (BITCOIN_DISPLAY_UNITS as readonly string[]).includes(value)
  )
}

/** Placeholder hint for the Send amount text field (direct entry, no stepping). */
export function amountInputPlaceholderForUnit(unit: BitcoinDisplayUnit): string {
  switch (unit) {
    case 'BTC':
      return '0.00000000'
    case 'mBTC':
      return '0.00000'
    case 'uBTC':
      return '0.00'
    case 'ksat':
      return '0.000'
    case 'sat':
      return '0'
    default: {
      const _exhaustive: never = unit
      return _exhaustive
    }
  }
}
