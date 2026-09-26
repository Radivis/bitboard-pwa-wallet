import { describe, expect, it } from 'vitest'
import {
  awaitDifferentInFlightWork,
  createInFlightLifecycleTracker,
} from '@/lib/wallet/lifecycle/lifecycle-in-flight-tracker'

describe('awaitDifferentInFlightWork', () => {
  it('continues after a different in-flight operation fails', async () => {
    const tracker = createInFlightLifecycleTracker()
    const failedWork = tracker.begin('wallet-1', async () => {
      throw new Error('operator unreachable')
    })

    const waited = awaitDifferentInFlightWork(tracker, 'wallet-2')

    await expect(failedWork).rejects.toThrow('operator unreachable')
    await expect(waited).resolves.toBeNull()
  })
})
