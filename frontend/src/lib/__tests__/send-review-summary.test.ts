import { describe, expect, it } from 'vitest'
import { computeSendReviewDisplayAmounts } from '../send-review-summary'

describe('computeSendReviewDisplayAmounts', () => {
  it('derives review row amounts from fee, balances, and input UTXOs', () => {
    const result = computeSendReviewDisplayAmounts({
      amountSats: 100_000,
      reviewFeeSats: 1_500,
      reviewChangeSats: 48_500,
      reviewInputUtxos: [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          amountSats: 150_000,
          txid: 'abc123',
          vout: 0,
        },
      ],
      spendableBalanceSats: 500_000,
      totalBalanceSats: 500_000,
    })

    expect(result.totalInputSats).toBe(150_000)
    expect(result.totalDeductedSats).toBe(101_500)
    expect(result.amountRemainingSats).toBe(398_500)
    expect(result.immediatelySpendableRemainingSats).toBe(350_000)
    expect(result.changeSats).toBe(48_500)
  })

  it('treats null change as zero', () => {
    const result = computeSendReviewDisplayAmounts({
      amountSats: 10_000,
      reviewFeeSats: 500,
      reviewChangeSats: null,
      reviewInputUtxos: [],
      spendableBalanceSats: 50_000,
      totalBalanceSats: 50_000,
    })

    expect(result.changeSats).toBe(0)
    expect(result.totalDeductedSats).toBe(10_500)
    expect(result.amountRemainingSats).toBe(39_500)
  })

  it('clamps remaining balances at zero when spend exceeds totals', () => {
    const result = computeSendReviewDisplayAmounts({
      amountSats: 80_000,
      reviewFeeSats: 2_000,
      reviewChangeSats: 0,
      reviewInputUtxos: [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          amountSats: 100_000,
          txid: 'abc123',
          vout: 0,
        },
      ],
      spendableBalanceSats: 50_000,
      totalBalanceSats: 60_000,
    })

    expect(result.amountRemainingSats).toBe(0)
    expect(result.immediatelySpendableRemainingSats).toBe(0)
  })

  it('handles empty input UTXO list', () => {
    const result = computeSendReviewDisplayAmounts({
      amountSats: 5_000,
      reviewFeeSats: 300,
      reviewChangeSats: 1_000,
      reviewInputUtxos: null,
      spendableBalanceSats: 20_000,
      totalBalanceSats: 25_000,
    })

    expect(result.totalInputSats).toBe(0)
    expect(result.immediatelySpendableRemainingSats).toBe(20_000)
  })
})
