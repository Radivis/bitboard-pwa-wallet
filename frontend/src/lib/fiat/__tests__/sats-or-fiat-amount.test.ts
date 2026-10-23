import { describe, expect, it } from 'vitest'
import {
  amountSatsFromSatsOrFiatField,
  satsOrFiatAmountReviewDecision,
} from '@/lib/fiat/sats-or-fiat-amount'

const spotPriceUsdPerBtc = 100_000

describe('amountSatsFromSatsOrFiatField', () => {
  it('returns whole sats when fiat entry is off', () => {
    expect(
      amountSatsFromSatsOrFiatField(' 1500 ', {
        useFiatAmountEntry: false,
        btcPriceInFiat: spotPriceUsdPerBtc,
      }),
    ).toBe(1500)
  })

  it('rejects empty, zero, fractions, and leading zeros when fiat entry is off', () => {
    const satsOptions = { useFiatAmountEntry: false, btcPriceInFiat: spotPriceUsdPerBtc }
    expect(amountSatsFromSatsOrFiatField('', satsOptions)).toBeNull()
    expect(amountSatsFromSatsOrFiatField('0', satsOptions)).toBeNull()
    expect(amountSatsFromSatsOrFiatField('1.5', satsOptions)).toBeNull()
    expect(amountSatsFromSatsOrFiatField('01', satsOptions)).toBeNull()
  })

  it('converts a positive fiat amount at the spot price', () => {
    expect(
      amountSatsFromSatsOrFiatField('10', {
        useFiatAmountEntry: true,
        btcPriceInFiat: spotPriceUsdPerBtc,
      }),
    ).toBe(10_000)
    expect(
      amountSatsFromSatsOrFiatField('10.50', {
        useFiatAmountEntry: true,
        btcPriceInFiat: spotPriceUsdPerBtc,
      }),
    ).toBe(10_500)
  })

  it('returns null for empty, zero, junk, sub-sat, or a missing price when fiat entry is on', () => {
    const fiatOptions = { useFiatAmountEntry: true, btcPriceInFiat: spotPriceUsdPerBtc }
    expect(amountSatsFromSatsOrFiatField('', fiatOptions)).toBeNull()
    expect(amountSatsFromSatsOrFiatField('0', fiatOptions)).toBeNull()
    expect(amountSatsFromSatsOrFiatField('0.00', fiatOptions)).toBeNull()
    expect(amountSatsFromSatsOrFiatField('abc', fiatOptions)).toBeNull()
    expect(amountSatsFromSatsOrFiatField('0.00000001', fiatOptions)).toBeNull()
    expect(
      amountSatsFromSatsOrFiatField('10', {
        useFiatAmountEntry: true,
        btcPriceInFiat: null,
      }),
    ).toBeNull()
  })
})

describe('satsOrFiatAmountReviewDecision', () => {
  const fiatEntry = {
    mainnetFiatEntry: true,
    hasUsableFiatSpot: true,
    btcPriceInFiat: spotPriceUsdPerBtc,
    currency: 'USD' as const,
  }

  it('blocks review when fiat entry has no usable spot price', () => {
    expect(
      satsOrFiatAmountReviewDecision('10', {
        ...fiatEntry,
        hasUsableFiatSpot: false,
        btcPriceInFiat: null,
      }),
    ).toEqual({ kind: 'blocked' })
  })

  it('rejects an unusable field', () => {
    expect(satsOrFiatAmountReviewDecision('abc', fiatEntry)).toEqual({
      kind: 'invalid',
      message: 'Enter an amount in USD.',
    })
    expect(
      satsOrFiatAmountReviewDecision('1.5', { ...fiatEntry, mainnetFiatEntry: false }),
    ).toEqual({
      kind: 'invalid',
      message: 'Enter a whole number of satoshis.',
    })
  })

  it('returns sats when the field is usable', () => {
    expect(satsOrFiatAmountReviewDecision('10', fiatEntry)).toEqual({
      kind: 'ready',
      amountSats: 10_000,
    })
  })
})
