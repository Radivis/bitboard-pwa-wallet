import { describe, it, expect } from 'vitest'
import { getLnOutgoingTotalInclFeeSats } from '../lightning-backend-service'

describe('getLnOutgoingTotalInclFeeSats', () => {
  it('sums payment amount and fees', () => {
    expect(
      getLnOutgoingTotalInclFeeSats({ amountSats: 10_000, feesPaidSats: 42 }),
    ).toBe(10_042)
  })

  it('equals amount when fee is zero', () => {
    expect(
      getLnOutgoingTotalInclFeeSats({ amountSats: 5_000, feesPaidSats: 0 }),
    ).toBe(5_000)
  })
})
