import { describe, it, expect } from 'vitest'
import {
  formatAmountInputFromSats,
  UX_DUST_FLOOR_SATS,
} from '@/lib/bitcoin-dust'

describe('bitcoin-dust', () => {
  it('exports dust floor constant', () => {
    expect(UX_DUST_FLOOR_SATS).toBe(546)
  })

  it('formatAmountInputFromSats maps to sats and btc strings', () => {
    expect(formatAmountInputFromSats(546, 'sats')).toBe('546')
    expect(formatAmountInputFromSats(546, 'btc')).toBe('0.00000546')
  })
})
