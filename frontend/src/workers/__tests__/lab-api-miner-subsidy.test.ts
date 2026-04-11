import { describe, expect, it } from 'vitest'
import {
  LAB_DEFAULT_MINER_SUBSIDY_SATS,
  normalizeMinerSubsidySats,
} from '@/workers/lab-api'

describe('normalizeMinerSubsidySats', () => {
  it('returns default for non-finite input', () => {
    expect(normalizeMinerSubsidySats(Number.NaN)).toBe(LAB_DEFAULT_MINER_SUBSIDY_SATS)
    expect(normalizeMinerSubsidySats(Number.POSITIVE_INFINITY)).toBe(
      LAB_DEFAULT_MINER_SUBSIDY_SATS,
    )
  })

  it('floors and clamps negatives to 0', () => {
    expect(normalizeMinerSubsidySats(100.7)).toBe(100)
    expect(normalizeMinerSubsidySats(0)).toBe(0)
    expect(normalizeMinerSubsidySats(-5)).toBe(0)
  })

  it('caps at MAX_SAFE_INTEGER', () => {
    expect(normalizeMinerSubsidySats(Number.MAX_SAFE_INTEGER + 1)).toBe(Number.MAX_SAFE_INTEGER)
  })
})
