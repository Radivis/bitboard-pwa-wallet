import { describe, expect, it, vi } from 'vitest'
import {
  parseBarkBoardAmountSats,
  reviewBarkBoard,
  type ReviewBarkBoardDeps,
} from '@/lib/bark/review-bark-board'

function reviewDeps(): ReviewBarkBoardDeps & {
  calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    estimateBoardOffchainFee: vi.fn(async (amountSats) => {
      calls.push(`estimate:${amountSats}`)
      return { grossAmountSats: amountSats, feeSats: 50, netAmountSats: amountSats - 50 }
    }),
    prepareBoardFunding: vi.fn(async () => {
      calls.push('prepare')
      return { fundingAddress: 'tb1qboardfunding', expiryHeight: 100 }
    }),
    prepareOnchainSend: vi.fn(async ({ toAddress, amountSats, feeRateSatPerVb }) => {
      calls.push(`onchain:${toAddress}:${amountSats}:${feeRateSatPerVb}`)
      return { psbtBase64: 'unsigned-psbt', feeSats: 180 }
    }),
  }
}

describe('reviewBarkBoard', () => {
  it('BARK-BOARD-08 estimates the board fee before deriving a funding key', async () => {
    const deps = reviewDeps()
    const review = await reviewBarkBoard(deps, { amountSats: 20_000, feeRateSatPerVb: 2 })

    expect(deps.calls).toEqual([
      'estimate:20000',
      'prepare',
      'onchain:tb1qboardfunding:20000:2',
    ])
    expect(review).toEqual({
      fundingAddress: 'tb1qboardfunding',
      psbtBase64: 'unsigned-psbt',
      onchainFeeSats: 180,
      offchainFeeSats: 50,
      netVtxoSats: 19_950,
      grossAmountSats: 20_000,
    })
    expect(review).not.toHaveProperty('expiryHeight')
    expect(review).not.toHaveProperty('receiveKeyIndex')
  })

  it('does not derive a key when the fee estimate fails', async () => {
    const deps = reviewDeps()
    deps.estimateBoardOffchainFee = vi.fn(async () => {
      throw new Error('below minimum')
    })

    await expect(
      reviewBarkBoard(deps, { amountSats: 1, feeRateSatPerVb: 2 }),
    ).rejects.toThrow('below minimum')
    expect(deps.prepareBoardFunding).not.toHaveBeenCalled()
    expect(deps.prepareOnchainSend).not.toHaveBeenCalled()
  })
})

describe('parseBarkBoardAmountSats', () => {
  it('accepts a positive whole satoshi count', () => {
    expect(parseBarkBoardAmountSats(' 1500 ')).toBe(1500)
  })

  it('rejects empty, zero, fractions, and leading zeros', () => {
    expect(parseBarkBoardAmountSats('')).toBeNull()
    expect(parseBarkBoardAmountSats('0')).toBeNull()
    expect(parseBarkBoardAmountSats('1.5')).toBeNull()
    expect(parseBarkBoardAmountSats('01')).toBeNull()
  })
})
