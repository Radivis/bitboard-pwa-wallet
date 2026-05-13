import { describe, it, expect } from 'vitest'
import { SATS_PER_BTC } from '../bitcoin-utils'
import {
  amountSatsFromFiatAndBtcPrice,
  parsePositiveFiatAmountInput,
} from '../fiat-amount-to-sats'

describe('parsePositiveFiatAmountInput', () => {
  it('accepts valid decimal strings', () => {
    expect(parsePositiveFiatAmountInput('0')).toBe(0)
    expect(parsePositiveFiatAmountInput(' 12.5 ')).toBe(12.5)
    expect(parsePositiveFiatAmountInput('.25')).toBe(0.25)
  })

  it('rejects invalid or negative input', () => {
    expect(parsePositiveFiatAmountInput('')).toBeNull()
    expect(parsePositiveFiatAmountInput('1,234')).toBeNull()
    expect(parsePositiveFiatAmountInput('-1')).toBeNull()
    expect(parsePositiveFiatAmountInput('1e3')).toBeNull()
  })
})

describe('amountSatsFromFiatAndBtcPrice', () => {
  it('rounds to nearest sat', () => {
    // 100 USD / 50_000 per BTC = 0.002 BTC = 200_000 sats
    expect(amountSatsFromFiatAndBtcPrice(100, 50_000)).toBe(200_000)
  })

  it('rounds nearest sat (half-sat in fiat rounds up)', () => {
    const fiatForExactlyHalfSat = (0.5 * 50_000) / SATS_PER_BTC
    expect(amountSatsFromFiatAndBtcPrice(fiatForExactlyHalfSat, 50_000)).toBe(1)
  })

  it('returns null for bad price or amount', () => {
    expect(amountSatsFromFiatAndBtcPrice(10, 0)).toBeNull()
    expect(amountSatsFromFiatAndBtcPrice(10, -1)).toBeNull()
    expect(amountSatsFromFiatAndBtcPrice(-1, 50_000)).toBeNull()
  })
})
