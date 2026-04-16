import { describe, it, expect } from 'vitest'
import {
  formatAmountInBitcoinDisplayUnit,
  parseAmountToSatsFromBitcoinDisplayUnit,
  isBitcoinDisplayUnit,
} from '@/lib/bitcoin-display-unit'
import { MAX_SAFE_SATS } from '@/lib/bitcoin-utils'

describe('bitcoin-display-unit', () => {
  it('formatAmountInBitcoinDisplayUnit matches expected scales', () => {
    expect(formatAmountInBitcoinDisplayUnit(100_000_000, 'BTC')).toBe('1.00000000')
    expect(formatAmountInBitcoinDisplayUnit(100_000, 'mBTC')).toBe('1.00000')
    expect(formatAmountInBitcoinDisplayUnit(100, 'uBTC')).toBe('1.00')
    expect(formatAmountInBitcoinDisplayUnit(1_000, 'ksat')).toBe('1.000')
    expect(formatAmountInBitcoinDisplayUnit(1234, 'sat')).toBe('1,234')
  })

  it('parseAmountToSatsFromBitcoinDisplayUnit inverts format for round trips', () => {
    const sats = 12_345_678
    for (const unit of ['BTC', 'mBTC', 'uBTC', 'ksat', 'sat'] as const) {
      const formatted = formatAmountInBitcoinDisplayUnit(sats, unit)
      expect(parseAmountToSatsFromBitcoinDisplayUnit(formatted, unit)).toBe(sats)
    }
  })

  it('parseAmountToSatsFromBitcoinDisplayUnit returns 0 for empty or invalid', () => {
    expect(parseAmountToSatsFromBitcoinDisplayUnit('', 'BTC')).toBe(0)
    expect(parseAmountToSatsFromBitcoinDisplayUnit('  ', 'sat')).toBe(0)
    expect(parseAmountToSatsFromBitcoinDisplayUnit('not-a-number', 'BTC')).toBe(0)
    expect(parseAmountToSatsFromBitcoinDisplayUnit('-1', 'sat')).toBe(0)
  })

  it('clamps parsed sats to MAX_SAFE_SATS', () => {
    const huge = '1' + '0'.repeat(30)
    expect(parseAmountToSatsFromBitcoinDisplayUnit(huge, 'sat')).toBe(MAX_SAFE_SATS)
  })

  it('isBitcoinDisplayUnit narrows type', () => {
    expect(isBitcoinDisplayUnit('BTC')).toBe(true)
    expect(isBitcoinDisplayUnit('btc')).toBe(false)
    expect(isBitcoinDisplayUnit(null)).toBe(false)
  })
})
