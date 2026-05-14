import { describe, it, expect } from 'vitest'
import {
  coerceStoredFiatCurrencyCode,
  getFiatCurrencyUiMeta,
} from '../supported-fiat-currencies'

describe('coerceStoredFiatCurrencyCode', () => {
  it('normalizes valid codes and falls back for invalid', () => {
    expect(coerceStoredFiatCurrencyCode(' eur ')).toBe('EUR')
    expect(coerceStoredFiatCurrencyCode('INVALID')).toBe('USD')
    expect(coerceStoredFiatCurrencyCode(null)).toBe('USD')
  })
})

describe('getFiatCurrencyUiMeta', () => {
  it('uses overrides for JPY', () => {
    expect(getFiatCurrencyUiMeta('JPY').maxFractionDigits).toBe(0)
    expect(getFiatCurrencyUiMeta('JPY').symbol).toBe('¥')
  })
})
