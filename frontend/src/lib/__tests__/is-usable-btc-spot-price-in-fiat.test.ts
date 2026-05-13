import { describe, expect, it } from 'vitest'
import { isUsableBtcSpotPriceInFiat } from '@/lib/is-usable-btc-spot-price-in-fiat'

describe('isUsableBtcSpotPriceInFiat', () => {
  it('returns false for null, undefined, non-positive, NaN, and non-finite', () => {
    expect(isUsableBtcSpotPriceInFiat(null)).toBe(false)
    expect(isUsableBtcSpotPriceInFiat(undefined)).toBe(false)
    expect(isUsableBtcSpotPriceInFiat(0)).toBe(false)
    expect(isUsableBtcSpotPriceInFiat(-1)).toBe(false)
    expect(isUsableBtcSpotPriceInFiat(Number.NaN)).toBe(false)
    expect(isUsableBtcSpotPriceInFiat(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('narrows to number when true', () => {
    const n: number | null = 42_000
    if (isUsableBtcSpotPriceInFiat(n)) {
      expect(n.toFixed(0)).toBe('42000')
    }
  })

  it('returns true for a finite positive price', () => {
    expect(isUsableBtcSpotPriceInFiat(50_000.25)).toBe(true)
  })
})
