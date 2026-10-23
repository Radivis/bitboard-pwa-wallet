import { describe, expect, it, vi } from 'vitest'
import {
  BarkOffboardParkedError,
  performBarkOffboard,
  type PerformBarkOffboardDeps,
} from '@/lib/bark/perform-bark-offboard'
import type { BarkOffboardReview } from '@/lib/bark/review-bark-offboard'

const amountReview: BarkOffboardReview = {
  mode: 'amount',
  destinationAddress: 'tb1qcurrent',
  amountSats: 10_000,
  feeSats: 250,
  onchainAmountSats: 10_000,
  grossAmountSats: 10_250,
}

const allReview: BarkOffboardReview = {
  mode: 'all',
  destinationAddress: 'tb1qcurrent',
  amountSats: null,
  feeSats: 400,
  onchainAmountSats: 49_600,
  grossAmountSats: 50_000,
}

function deps(overrides: Partial<PerformBarkOffboardDeps> = {}): PerformBarkOffboardDeps {
  return {
    sendOnchain: vi.fn(async () => 'cc'),
    offboardAll: vi.fn(async () => 'dd'),
    syncBark: vi.fn(async () => undefined),
    startOnchainBackgroundSync: vi.fn(),
    ...overrides,
  }
}

describe('performBarkOffboard', () => {
  it('BARK-EXIT-05 sends the reviewed amount to the current address', async () => {
    const revealNextAddress = vi.fn()
    const esploraBroadcast = vi.fn()
    const offboardDeps = deps()

    const result = await performBarkOffboard(offboardDeps, amountReview)

    expect(offboardDeps.sendOnchain).toHaveBeenCalledWith('tb1qcurrent', 10_000)
    expect(offboardDeps.offboardAll).not.toHaveBeenCalled()
    expect(offboardDeps.syncBark).toHaveBeenCalled()
    expect(offboardDeps.startOnchainBackgroundSync).toHaveBeenCalled()
    expect(revealNextAddress).not.toHaveBeenCalled()
    expect(esploraBroadcast).not.toHaveBeenCalled()
    expect(result.txid).toBe('cc')
    expect(result.syncWarning).toBeNull()
  })

  it('BARK-EXIT-06 offboards the whole spendable balance to the current address', async () => {
    const offboardDeps = deps()

    const result = await performBarkOffboard(offboardDeps, allReview)

    expect(offboardDeps.offboardAll).toHaveBeenCalledWith('tb1qcurrent')
    expect(offboardDeps.sendOnchain).not.toHaveBeenCalled()
    expect(result.txid).toBe('dd')
  })

  it('BARK-EXIT-07 does not sync when Bark rejects the exit', async () => {
    const offboardDeps = deps({
      sendOnchain: vi.fn(async () => {
        throw new Error('insufficient funds')
      }),
    })

    await expect(performBarkOffboard(offboardDeps, amountReview)).rejects.toThrow('insufficient funds')
    expect(offboardDeps.syncBark).not.toHaveBeenCalled()
    expect(offboardDeps.startOnchainBackgroundSync).not.toHaveBeenCalled()
  })

  it('does not sync when the exit parks before broadcast', async () => {
    const offboardDeps = deps({
      sendOnchain: vi.fn(async () => {
        throw new Error('bark_offboard_parked: could not complete yet')
      }),
    })

    await expect(performBarkOffboard(offboardDeps, amountReview)).rejects.toBeInstanceOf(
      BarkOffboardParkedError,
    )
    expect(offboardDeps.syncBark).not.toHaveBeenCalled()
    expect(offboardDeps.startOnchainBackgroundSync).not.toHaveBeenCalled()
  })
})
