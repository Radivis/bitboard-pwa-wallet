import { describe, expect, it } from 'vitest'
import type { UnilateralExitActorSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import { unilateralExitActorSnapshotEqual } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-snapshot'

function createSnapshot(
  overrides: Partial<UnilateralExitActorSnapshot['context']> = {},
): UnilateralExitActorSnapshot {
  return {
    status: 'active',
    value: 'idle',
    context: {
      walletScope: null,
      jobOutpoints: [],
      progress: null,
      automationEnabled: false,
      pausedReason: null,
      lastErrorMessage: null,
      feeRateSatPerVb: null,
      proceedRequested: false,
      proceedTargetStepIndex: null,
      progressRefreshRequested: false,
      unconfirmedParentRetry: null,
      pollDelayMs: 2_000,
      parentDataWaitMs: 15_000,
      ...overrides,
    },
  }
}

describe('unilateralExitActorSnapshotEqual', () => {
  it('treats snapshots with equivalent context as equal', () => {
    const previous = createSnapshot({
      jobOutpoints: [{ txid: 'aa', vout: 0 }],
      automationEnabled: true,
    })
    const next = createSnapshot({
      jobOutpoints: [{ txid: 'aa', vout: 0 }],
      automationEnabled: true,
    })

    expect(unilateralExitActorSnapshotEqual(previous, next)).toBe(true)
  })

  it('detects machine state changes', () => {
    const previous = createSnapshot()
    const next = {
      ...createSnapshot(),
      value: 'checkingProgress' as const,
    }

    expect(unilateralExitActorSnapshotEqual(previous, next)).toBe(false)
  })
})
