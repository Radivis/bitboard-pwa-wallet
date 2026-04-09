import { describe, expect, it } from 'vitest'
import {
  amountSatsFromPpm,
  estimateRequiredFeeSats,
  feeRateSatPerVbFromRandomRoll,
  isRandomAmountViable,
} from '@/workers/lab-random-transactions'

describe('lab random transaction helpers', () => {
  it('maps fee-rate rolls to 0.1..10.0 sat/vB', () => {
    expect(feeRateSatPerVbFromRandomRoll(1)).toBe(0.1)
    expect(feeRateSatPerVbFromRandomRoll(100)).toBe(10)
  })

  it('derives amount from ppm share of total input', () => {
    expect(amountSatsFromPpm(1_000_000, 1)).toBe(1)
    expect(amountSatsFromPpm(1_000_000, 500_000)).toBe(500_000)
    expect(amountSatsFromPpm(1_000_000, 1_000_000)).toBe(1_000_000)
  })

  it('requires amount to cover dust plus fee', () => {
    const feeSats = estimateRequiredFeeSats(1, 1)
    expect(isRandomAmountViable(546 + feeSats - 1, 1_000_000, feeSats)).toBe(false)
    expect(isRandomAmountViable(546 + feeSats, 1_000_000, feeSats)).toBe(true)
  })

  it('rejects amounts that spend entire input', () => {
    const feeSats = estimateRequiredFeeSats(1, 0.1)
    expect(isRandomAmountViable(50_000, 50_000, feeSats)).toBe(false)
  })
})
