import { describe, expect, it, vi } from 'vitest'
import {
  BarkOffboardParkedError,
  performBarkExit,
  type PerformBarkExitDeps,
} from '@/lib/bark/perform-bark-exit'
import type { BarkExitReview } from '@/lib/bark/review-bark-exit'

const amountReview: BarkExitReview = {
  mode: 'amount',
  destinationAddress: 'tb1qcurrent',
  amountSats: 10_000,
  feeRateSatPerVb: 1,
  feeSats: 250,
  onchainAmountSats: 10_000,
  grossAmountSats: 10_250,
}

const allReview: BarkExitReview = {
  mode: 'all',
  destinationAddress: 'tb1qcurrent',
  amountSats: null,
  feeRateSatPerVb: 1,
  feeSats: 400,
  onchainAmountSats: 49_600,
  grossAmountSats: 50_000,
}

function deps(overrides: Partial<PerformBarkExitDeps> = {}): PerformBarkExitDeps {
  return {
    sendOnchain: vi.fn(async () => 'cc'),
    offboardAll: vi.fn(async () => 'dd'),
    syncBark: vi.fn(async () => undefined),
    startOnchainBackgroundSync: vi.fn(),
    ...overrides,
  }
}

describe('performBarkExit', () => {
  it('BARK-EXIT-05 sends the reviewed amount to the current address', async () => {
    const revealNextAddress = vi.fn()
    const esploraBroadcast = vi.fn()
    const exitDeps = deps()

    const result = await performBarkExit(exitDeps, amountReview)

    expect(exitDeps.sendOnchain).toHaveBeenCalledWith('tb1qcurrent', 10_000, 1)
    expect(exitDeps.offboardAll).not.toHaveBeenCalled()
    expect(exitDeps.syncBark).toHaveBeenCalled()
    expect(exitDeps.startOnchainBackgroundSync).toHaveBeenCalled()
    expect(revealNextAddress).not.toHaveBeenCalled()
    expect(esploraBroadcast).not.toHaveBeenCalled()
    expect(result.txid).toBe('cc')
    expect(result.syncWarning).toBeNull()
  })

  it('BARK-EXIT-06 offboards the whole spendable balance to the current address', async () => {
    const exitDeps = deps()

    const result = await performBarkExit(exitDeps, allReview)

    expect(exitDeps.offboardAll).toHaveBeenCalledWith('tb1qcurrent', 1)
    expect(exitDeps.sendOnchain).not.toHaveBeenCalled()
    expect(result.txid).toBe('dd')
  })

  it('BARK-EXIT-07 does not sync when Bark rejects the exit', async () => {
    const exitDeps = deps({
      sendOnchain: vi.fn(async () => {
        throw new Error('insufficient funds')
      }),
    })

    await expect(performBarkExit(exitDeps, amountReview)).rejects.toThrow('insufficient funds')
    expect(exitDeps.syncBark).not.toHaveBeenCalled()
    expect(exitDeps.startOnchainBackgroundSync).not.toHaveBeenCalled()
  })

  it('does not sync when the exit parks before broadcast', async () => {
    const exitDeps = deps({
      sendOnchain: vi.fn(async () => {
        throw new Error('bark_offboard_parked: could not complete yet')
      }),
    })

    await expect(performBarkExit(exitDeps, amountReview)).rejects.toBeInstanceOf(
      BarkOffboardParkedError,
    )
    expect(exitDeps.syncBark).not.toHaveBeenCalled()
    expect(exitDeps.startOnchainBackgroundSync).not.toHaveBeenCalled()
  })
})
