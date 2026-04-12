import { describe, expect, it } from 'vitest'
import { labVsizeFromWeight } from '@/lib/lab-tx-weight'

describe('labVsizeFromWeight', () => {
  it('returns 0 for non-positive or non-finite weight', () => {
    expect(labVsizeFromWeight(0)).toBe(0)
    expect(labVsizeFromWeight(-1)).toBe(0)
    expect(labVsizeFromWeight(Number.NaN)).toBe(0)
  })

  it('maps weight to ceil(weight/4) per BIP141', () => {
    expect(labVsizeFromWeight(400)).toBe(100)
    expect(labVsizeFromWeight(1)).toBe(1)
    expect(labVsizeFromWeight(4)).toBe(1)
    expect(labVsizeFromWeight(5)).toBe(2)
  })
})
