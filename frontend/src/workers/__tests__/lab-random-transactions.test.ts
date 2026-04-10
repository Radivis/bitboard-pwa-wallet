import { describe, expect, it } from 'vitest'
import {
  estimateRequiredFeeSats,
  feeRateSatPerVbFromRandomRoll,
  isRandomAmountViable,
  sampleRandomLabAmountSats,
} from '@/workers/lab-random-transactions'

describe('lab random transaction helpers', () => {
  it('maps fee-rate rolls to 0.1..10.0 sat/vB', () => {
    expect(feeRateSatPerVbFromRandomRoll(1)).toBe(0.1)
    expect(feeRateSatPerVbFromRandomRoll(100)).toBe(10)
  })

  it('requires amount to cover dust plus fee and not exceed totalInput minus fee', () => {
    const feeSats = estimateRequiredFeeSats(1, 1)
    const minOk = 546 + feeSats
    const maxOk = 1_000_000 - feeSats
    expect(isRandomAmountViable(minOk - 1, 1_000_000, feeSats)).toBe(false)
    expect(isRandomAmountViable(minOk, 1_000_000, feeSats)).toBe(true)
    expect(isRandomAmountViable(maxOk, 1_000_000, feeSats)).toBe(true)
    expect(isRandomAmountViable(maxOk + 1, 1_000_000, feeSats)).toBe(false)
  })

  it('rejects amounts that would exceed balance minus fee', () => {
    const feeSats = estimateRequiredFeeSats(1, 0.1)
    const totalInput = 50_000
    const maxAmount = totalInput - feeSats
    expect(isRandomAmountViable(maxAmount + 1, totalInput, feeSats)).toBe(false)
    expect(isRandomAmountViable(maxAmount, totalInput, feeSats)).toBe(true)
  })

  it('returns null from sampleRandomLabAmountSats when feasible range is empty', () => {
    const feeSats = estimateRequiredFeeSats(1, 10)
    const tinyTotal = 546 + feeSats + (feeSats - 1)
    expect(sampleRandomLabAmountSats(tinyTotal, feeSats)).toBe(null)
  })

  it('returns null or an amount within dust+fee..totalInput−fee', () => {
    const feeSats = estimateRequiredFeeSats(1, 1)
    const totalInput = 1_000_000
    let sawNonNull = false
    for (let i = 0; i < 500; i++) {
      const amount = sampleRandomLabAmountSats(totalInput, feeSats)
      if (amount === null) continue
      sawNonNull = true
      expect(isRandomAmountViable(amount, totalInput, feeSats)).toBe(true)
    }
    expect(sawNonNull).toBe(true)
  })
})
