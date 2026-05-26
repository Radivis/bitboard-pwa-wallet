import { describe, it, expect } from 'vitest'
import {
  formatFiatFromSatsAndBtcPrice,
  formatFiatInputStringFromSats,
  formatFiatNumericStringForInput,
} from '../format-fiat-display'

describe('formatFiatFromSatsAndBtcPrice', () => {
  it('converts sats via BTC price (1 BTC @ 100k USD)', () => {
    const out = formatFiatFromSatsAndBtcPrice(100_000_000, 100_000, 'USD')
    expect(out.replace(/\s/g, '')).toMatch(/^(\$|US\$)?100[.,]000(00)?/)
  })
})

describe('formatFiatNumericStringForInput', () => {
  it('trims trailing zeros for USD scale', () => {
    expect(formatFiatNumericStringForInput(10.5, 'USD')).toBe('10.5')
    expect(formatFiatNumericStringForInput(10.0, 'USD')).toBe('10')
  })
})

describe('formatFiatInputStringFromSats', () => {
  it('mirrors inverse of fiat→sats at a round price', () => {
    const sats = 200_000
    const price = 50_000
    expect(formatFiatInputStringFromSats(sats, price, 'USD')).toBe('100')
  })
})
