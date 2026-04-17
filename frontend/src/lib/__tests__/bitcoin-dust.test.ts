import { describe, it, expect } from 'vitest'
import {
  formatAmountInputFromSats,
  UX_DUST_FLOOR_SATS,
} from '@/lib/bitcoin-dust'

describe('bitcoin-dust', () => {
  it('exports dust floor constant', () => {
    expect(UX_DUST_FLOOR_SATS).toBe(546)
  })

  it('formatAmountInputFromSats maps units for form field', () => {
    expect(formatAmountInputFromSats(546, 'sat')).toBe('546')
    expect(formatAmountInputFromSats(546, 'BTC')).toBe('0.00000546')
    expect(formatAmountInputFromSats(100_000, 'mBTC')).toBe('1.00000')
  })
})
