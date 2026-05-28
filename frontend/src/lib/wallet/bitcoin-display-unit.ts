import { formatSats, MAX_SAFE_SATS, SATS_PER_BTC } from '@/lib/wallet/bitcoin-utils'
import type { NetworkMode } from '@/stores/walletStore'

export type LiveTestNetworkMode = 'testnet' | 'signet' | 'regtest'

export type NetworkUnitIndicator = 'test' | 'lab' | null

export function isLiveTestNetwork(mode: NetworkMode): mode is LiveTestNetworkMode {
  return mode === 'testnet' || mode === 'signet' || mode === 'regtest'
}

export function getNetworkUnitIndicator(mode: NetworkMode): NetworkUnitIndicator {
  if (mode === 'lab') {
    return 'lab'
  }
  if (isLiveTestNetwork(mode)) {
    return 'test'
  }
  return null
}

/** Plain-text unit label with network prefix (t on live test networks; lab uses icon in rich UI). */
export function getPrefixedBitcoinDisplayUnitLabel(
  unit: BitcoinDisplayUnit,
  mode: NetworkMode,
): string {
  const base = BITCOIN_DISPLAY_UNIT_LABEL[unit]
  if (isLiveTestNetwork(mode)) {
    return `t${base}`
  }
  return base
}

/** Accessible name for unit controls (includes Lab prefix for lab mode). */
export function getAccessibleBitcoinDisplayUnitLabel(
  unit: BitcoinDisplayUnit,
  mode: NetworkMode,
): string {
  const base = BITCOIN_DISPLAY_UNIT_LABEL[unit]
  if (isLiveTestNetwork(mode)) {
    return `t${base}`
  }
  if (mode === 'lab') {
    return `Lab ${base}`
  }
  return base
}

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

function clampSats(sats: number): number {
  if (!Number.isFinite(sats) || sats < 0) return 0
  return Math.min(Math.floor(sats), MAX_SAFE_SATS)
}

/**
 * Formats an integer satoshi amount for display in the given unit.
 */
export function formatAmountInBitcoinDisplayUnit(
  sats: number,
  unit: BitcoinDisplayUnit,
): string {
  const clampedSats = Number.isFinite(sats) && sats >= 0 ? sats : 0
  switch (unit) {
    case 'BTC':
      return (clampedSats / SATS_PER_BTC).toFixed(8)
    case 'mBTC':
      return (clampedSats / SATS_PER_mBTC).toFixed(5)
    case 'uBTC':
      return (clampedSats / SATS_PER_uBTC).toFixed(2)
    case 'sat':
      return formatSats(clampedSats)
    case 'ksat':
      return (clampedSats / SATS_PER_ksat).toFixed(3)
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
      const parsedBtcAmount = parseFloat(trimmed)
      if (
        Number.isNaN(parsedBtcAmount) ||
        !Number.isFinite(parsedBtcAmount) ||
        parsedBtcAmount < 0
      ) {
        return 0
      }
      return clampSats(parsedBtcAmount * SATS_PER_BTC)
    }
    case 'mBTC': {
      const parsedMBtcAmount = parseFloat(trimmed)
      if (
        Number.isNaN(parsedMBtcAmount) ||
        !Number.isFinite(parsedMBtcAmount) ||
        parsedMBtcAmount < 0
      ) {
        return 0
      }
      return clampSats(parsedMBtcAmount * SATS_PER_mBTC)
    }
    case 'uBTC': {
      const parsedUBtcAmount = parseFloat(trimmed)
      if (
        Number.isNaN(parsedUBtcAmount) ||
        !Number.isFinite(parsedUBtcAmount) ||
        parsedUBtcAmount < 0
      ) {
        return 0
      }
      return clampSats(parsedUBtcAmount * SATS_PER_uBTC)
    }
    case 'ksat': {
      const parsedKsatAmount = parseFloat(trimmed)
      if (
        Number.isNaN(parsedKsatAmount) ||
        !Number.isFinite(parsedKsatAmount) ||
        parsedKsatAmount < 0
      ) {
        return 0
      }
      return clampSats(parsedKsatAmount * SATS_PER_ksat)
    }
    case 'sat': {
      const normalized = trimmed.replace(/,/g, '')
      const parsedSatAmount = parseInt(normalized, 10)
      if (Number.isNaN(parsedSatAmount) || parsedSatAmount < 0) {
        return 0
      }
      return clampSats(parsedSatAmount)
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
