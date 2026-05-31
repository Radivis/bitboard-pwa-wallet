import { describe, expect, it } from 'vitest'
import { MAX_SAFE_SATS } from '@/lib/wallet/bitcoin-utils'
import { isValidSendAmountSats } from '../send-amount-validation'

describe('isValidSendAmountSats', () => {
  it('accepts integer sats from 1 through MAX_SAFE_SATS', () => {
    expect(isValidSendAmountSats(1)).toBe(true)
    expect(isValidSendAmountSats(MAX_SAFE_SATS)).toBe(true)
  })

  it('rejects non-integers and out-of-range values', () => {
    expect(isValidSendAmountSats(0)).toBe(false)
    expect(isValidSendAmountSats(1.5)).toBe(false)
    expect(isValidSendAmountSats(MAX_SAFE_SATS + 1)).toBe(false)
  })
})
