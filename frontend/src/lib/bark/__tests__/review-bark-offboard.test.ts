import { describe, expect, it, vi } from 'vitest'
import { BARK_EMERGENCY_EXIT_BLOCKS_ACTION } from '@/lib/bark/emergency-exit-blocks-action'
import { reviewBarkOffboardAmount, type ReviewBarkOffboardDeps } from '@/lib/bark/review-bark-offboard'

function reviewDeps(
  balance: { spendableSats: number; exitingSats: number },
): ReviewBarkOffboardDeps {
  return {
    readBalance: vi.fn(async () => balance),
    estimateSendOnchain: vi.fn(async () => ({
      feeSats: 250,
      netAmountSats: 10_000,
      grossAmountSats: 10_250,
    })),
    estimateOffboardAll: vi.fn(),
  }
}

describe('reviewBarkOffboardAmount', () => {
  it('shows the cancel sentence and skips the estimate when an emergency exit holds the coins', async () => {
    const deps = reviewDeps({ spendableSats: 0, exitingSats: 100_000 })

    await expect(
      reviewBarkOffboardAmount(deps, {
        destinationAddress: 'tb1qcurrent',
        amountSats: 20_000,
      }),
    ).rejects.toThrow(BARK_EMERGENCY_EXIT_BLOCKS_ACTION)

    expect(deps.estimateSendOnchain).not.toHaveBeenCalled()
  })

  it('estimates when the amount still fits in spendable', async () => {
    const deps = reviewDeps({ spendableSats: 50_000, exitingSats: 0 })

    await expect(
      reviewBarkOffboardAmount(deps, {
        destinationAddress: 'tb1qcurrent',
        amountSats: 10_000,
      }),
    ).resolves.toMatchObject({ feeSats: 250, onchainAmountSats: 10_000 })

    expect(deps.estimateSendOnchain).toHaveBeenCalledOnce()
  })
})
