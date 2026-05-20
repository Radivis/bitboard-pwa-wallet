import { describe, it, expect } from 'vitest'
import {
  formatAmountInBitcoinDisplayUnit,
  parseAmountToSatsFromBitcoinDisplayUnit,
  isBitcoinDisplayUnit,
  isLiveTestNetwork,
  getNetworkUnitIndicator,
  getPrefixedBitcoinDisplayUnitLabel,
  getAccessibleBitcoinDisplayUnitLabel,
  BITCOIN_DISPLAY_UNITS,
} from '@/lib/bitcoin-display-unit'
import { MAX_SAFE_SATS } from '@/lib/bitcoin-utils'

describe('bitcoin-display-unit', () => {
  it('formatAmountInBitcoinDisplayUnit matches expected scales', () => {
    expect(formatAmountInBitcoinDisplayUnit(100_000_000, 'BTC')).toBe('1.00000000')
    expect(formatAmountInBitcoinDisplayUnit(100_000, 'mBTC')).toBe('1.00000')
    expect(formatAmountInBitcoinDisplayUnit(100, 'uBTC')).toBe('1.00')
    expect(formatAmountInBitcoinDisplayUnit(1_000, 'ksat')).toBe('1.000')
    expect(formatAmountInBitcoinDisplayUnit(1234, 'sat')).toBe('1234')
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

  it('isLiveTestNetwork identifies testnet, signet, and regtest only', () => {
    expect(isLiveTestNetwork('testnet')).toBe(true)
    expect(isLiveTestNetwork('signet')).toBe(true)
    expect(isLiveTestNetwork('regtest')).toBe(true)
    expect(isLiveTestNetwork('mainnet')).toBe(false)
    expect(isLiveTestNetwork('lab')).toBe(false)
  })

  it('getNetworkUnitIndicator returns test, lab, or null', () => {
    expect(getNetworkUnitIndicator('testnet')).toBe('test')
    expect(getNetworkUnitIndicator('signet')).toBe('test')
    expect(getNetworkUnitIndicator('regtest')).toBe('test')
    expect(getNetworkUnitIndicator('lab')).toBe('lab')
    expect(getNetworkUnitIndicator('mainnet')).toBe(null)
  })

  it('getPrefixedBitcoinDisplayUnitLabel prefixes all units on live test networks', () => {
    for (const unit of BITCOIN_DISPLAY_UNITS) {
      expect(getPrefixedBitcoinDisplayUnitLabel(unit, 'testnet')).toMatch(/^t/)
      expect(getPrefixedBitcoinDisplayUnitLabel(unit, 'mainnet')).not.toMatch(/^t/)
      expect(getPrefixedBitcoinDisplayUnitLabel(unit, 'lab')).not.toMatch(/^t/)
    }
    expect(getPrefixedBitcoinDisplayUnitLabel('BTC', 'signet')).toBe('tBTC')
    expect(getPrefixedBitcoinDisplayUnitLabel('sat', 'regtest')).toBe('tsat')
  })

  it('getAccessibleBitcoinDisplayUnitLabel uses Lab prefix for lab mode', () => {
    expect(getAccessibleBitcoinDisplayUnitLabel('BTC', 'lab')).toBe('Lab BTC')
    expect(getAccessibleBitcoinDisplayUnitLabel('sat', 'lab')).toBe('Lab sat')
    expect(getAccessibleBitcoinDisplayUnitLabel('BTC', 'testnet')).toBe('tBTC')
    expect(getAccessibleBitcoinDisplayUnitLabel('BTC', 'mainnet')).toBe('BTC')
  })
})
