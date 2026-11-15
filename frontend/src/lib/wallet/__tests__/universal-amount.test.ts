import { describe, expect, it } from 'vitest'
import {
  formatUniversalAmountFromSats,
  parseUniversalAmount,
  resolveUniversalAmountEntry,
  type UniversalAmountEntry,
} from '@/lib/wallet/universal-amount'

const spotPriceUsdPerBtc = 100_000

const satEntry: UniversalAmountEntry = { mode: 'bitcoin', bitcoinUnit: 'sat' }

const fiatEntry: UniversalAmountEntry = {
  mode: 'fiat',
  currency: 'USD',
  btcPriceInFiat: spotPriceUsdPerBtc,
  hasUsableFiatSpot: true,
  rateLoading: false,
}

describe('resolveUniversalAmountEntry', () => {
  const baseContext = {
    currency: 'EUR' as const,
    btcPriceInFiat: spotPriceUsdPerBtc,
    hasUsableFiatSpot: true,
    rateLoading: false,
    defaultBitcoinUnit: 'sat' as const,
  }

  it('uses fiat on mainnet even when a Bitcoin unit override is set', () => {
    expect(
      resolveUniversalAmountEntry({
        ...baseContext,
        mainnetFiatEntry: true,
        bitcoinUnitOverride: 'BTC',
      }),
    ).toMatchObject({ mode: 'fiat', currency: 'EUR' })
  })

  it('keeps the Bitcoin unit off mainnet when fiat mode is on', () => {
    expect(
      resolveUniversalAmountEntry({
        ...baseContext,
        mainnetFiatEntry: false,
        bitcoinUnitOverride: 'mBTC',
      }),
    ).toEqual({ mode: 'bitcoin', bitcoinUnit: 'mBTC' })
  })

  it('uses the Settings unit when no override is passed', () => {
    expect(
      resolveUniversalAmountEntry({
        ...baseContext,
        mainnetFiatEntry: false,
        defaultBitcoinUnit: 'uBTC',
      }),
    ).toEqual({ mode: 'bitcoin', bitcoinUnit: 'uBTC' })
  })
})

describe('parseUniversalAmount', () => {
  it('treats blank text as empty', () => {
    expect(parseUniversalAmount('  ', satEntry)).toEqual({ kind: 'empty' })
  })

  it('parses whole sats and rejects fractions and leading zeros', () => {
    expect(parseUniversalAmount('1,500', satEntry)).toEqual({ kind: 'sats', amountSats: 1500 })
    expect(parseUniversalAmount('1.5', satEntry)).toEqual({ kind: 'invalid' })
    expect(parseUniversalAmount('01', satEntry)).toEqual({ kind: 'invalid' })
    expect(parseUniversalAmount('0', satEntry)).toEqual({ kind: 'sats', amountSats: 0 })
  })

  it('parses other Bitcoin display units through the display-unit parser', () => {
    expect(parseUniversalAmount('0.5', { mode: 'bitcoin', bitcoinUnit: 'BTC' })).toEqual({
      kind: 'sats',
      amountSats: 50_000_000,
    })
    expect(parseUniversalAmount('1.5', { mode: 'bitcoin', bitcoinUnit: 'mBTC' })).toEqual({
      kind: 'sats',
      amountSats: 150_000,
    })
    expect(parseUniversalAmount('abc', { mode: 'bitcoin', bitcoinUnit: 'BTC' })).toEqual({
      kind: 'invalid',
    })
  })

  it('converts fiat at the spot price and rejects a missing price', () => {
    expect(parseUniversalAmount('10.50', fiatEntry)).toEqual({ kind: 'sats', amountSats: 10_500 })
    expect(parseUniversalAmount('abc', fiatEntry)).toEqual({ kind: 'invalid' })
    expect(
      parseUniversalAmount('10', { ...fiatEntry, hasUsableFiatSpot: false, btcPriceInFiat: null }),
    ).toEqual({ kind: 'invalid' })
  })
})

describe('formatUniversalAmountFromSats', () => {
  it('formats sats in the active Bitcoin unit', () => {
    expect(formatUniversalAmountFromSats(50_000_000, { mode: 'bitcoin', bitcoinUnit: 'BTC' })).toBe(
      '0.50000000',
    )
    expect(formatUniversalAmountFromSats(546, satEntry)).toBe('546')
  })
})
