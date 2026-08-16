import { describe, expect, it } from 'vitest'
import {
  isCurrentStepRelayed,
  isPackageNotChildWithUnconfirmedParentsError,
  isInsufficientConfirmedBumperFundsError,
  isRetryableUnconfirmedParentPackageError,
  isWaitingForRelayedStepConfirmation,
  needsBroadcastEnsurance,
  broadcastedStepIsVisibleOnNetwork,
  rewoundProgressFromPackageError,
  unconfirmedParentRetryFromProgress,
  unconfirmedParentRetryIsActive,
  UNCONFIRMED_PARENT_PACKAGE_RETRY_MESSAGE,
} from '@/lib/arkade/unilateral-exit-broadcast'
import type { ArkadeUnilateralExitProgress } from '@/workers/arkade-api'

function progress(
  overrides: Partial<ArkadeUnilateralExitProgress>,
): ArkadeUnilateralExitProgress {
  return {
    stepIndex: 0,
    totalSteps: 2,
    phase: 'idle',
    currentStepTxRelayed: false,
    nodeStatuses: [],
    leafStatuses: [],
    ...overrides,
  }
}

describe('unilateral-exit-broadcast', () => {
  it('isCurrentStepRelayed reflects WASM relay flag or proceed wait stamp', () => {
    expect(isCurrentStepRelayed(progress({ currentStepTxRelayed: true }))).toBe(true)
    expect(
      isCurrentStepRelayed(
        progress({
          currentStepTxRelayed: false,
          currentStepWaitingSince: 1_700_000_000,
        }),
      ),
    ).toBe(true)
    expect(isCurrentStepRelayed(progress({ currentStepTxRelayed: false }))).toBe(false)
  })

  it('needsBroadcastEnsurance when waiting phase but not relayed', () => {
    expect(
      needsBroadcastEnsurance(
        progress({ phase: 'waiting', currentStepTxRelayed: false }),
      ),
    ).toBe(true)
    expect(
      needsBroadcastEnsurance(
        progress({ phase: 'waiting', currentStepTxRelayed: true }),
      ),
    ).toBe(false)
  })

  it('isWaitingForRelayedStepConfirmation requires relay', () => {
    expect(
      isWaitingForRelayedStepConfirmation(
        progress({
          phase: 'waiting',
          currentStepTxRelayed: false,
        }),
      ),
    ).toBe(false)
    expect(
      isWaitingForRelayedStepConfirmation(
        progress({
          phase: 'waiting',
          currentStepTxRelayed: true,
          currentStepWaitingSince: 1_700_000_000,
        }),
      ),
    ).toBe(true)
  })

  it('detects package-not-child-with-unconfirmed-parents as a retryable parent wait', () => {
    expect(
      isPackageNotChildWithUnconfirmedParentsError(
        new Error(
          'Ark client error: transaction package not accepted: package-not-child-with-unconfirmed-parents',
        ),
      ),
    ).toBe(true)
    expect(isPackageNotChildWithUnconfirmedParentsError(new Error('Fee rate is required'))).toBe(
      false,
    )
  })

  it('treats a chain jump past the broadcasted step as visible', () => {
    const before = progress({
      stepIndex: 12,
      totalSteps: 23,
      nodeStatuses: [{ txid: '71425e5c', confirmations: 0, status: 'inProgress' }],
    })
    const after = progress({
      stepIndex: 15,
      totalSteps: 23,
      currentStepTxRelayed: false,
      nodeStatuses: [
        { txid: '71425e5c', confirmations: 1, status: 'confirmed' },
        { txid: 'c751854c', confirmations: 0, status: 'inProgress' },
      ],
    })
    expect(broadcastedStepIsVisibleOnNetwork(before, after)).toBe(true)
    expect(isCurrentStepRelayed(after)).toBe(false)
  })

  it('does not treat a rewind to an earlier step as a successful broadcast', () => {
    const before = progress({
      stepIndex: 1,
      totalSteps: 27,
      nodeStatuses: [
        { txid: '13199ec3', confirmations: 3, status: 'confirmed' },
        { txid: 'e7eebf8d', confirmations: 0, status: 'inProgress' },
      ],
    })
    const after = progress({
      stepIndex: 0,
      totalSteps: 27,
      nodeStatuses: [
        { txid: '13199ec3', confirmations: 0, status: 'inProgress' },
        { txid: 'e7eebf8d', confirmations: 5, status: 'confirmed' },
      ],
    })
    expect(broadcastedStepIsVisibleOnNetwork(before, after)).toBe(false)
  })

  it('reads rewound progress off a package-not-child error', () => {
    const rewound = progress({ stepIndex: 20, totalSteps: 23 })
    const error = Object.assign(new Error('Previous unroll step is not confirmed on-chain yet.'), {
      rewoundProgress: rewound,
    })
    expect(rewoundProgressFromPackageError(error)?.stepIndex).toBe(20)
    expect(rewoundProgressFromPackageError(new Error('other'))).toBeUndefined()
  })

  it('treats remapped parent-wait copy as a retryable unconfirmed-parent error', () => {
    expect(
      isRetryableUnconfirmedParentPackageError(new Error(UNCONFIRMED_PARENT_PACKAGE_RETRY_MESSAGE)),
    ).toBe(true)
    expect(
      isRetryableUnconfirmedParentPackageError(
        Object.assign(new Error('hidden'), { retryableUnconfirmedParent: true }),
      ),
    ).toBe(true)
    expect(isRetryableUnconfirmedParentPackageError(new Error('Fee rate is required'))).toBe(false)
  })

  it('treats insufficient confirmed bumper funds as retryable parent wait', () => {
    const error = new Error(
      'Insufficient confirmed funds: need 0.00001234 BTC, have 0 sat (skipped 1 unconfirmed UTXOs)',
    )
    expect(isInsufficientConfirmedBumperFundsError(error)).toBe(true)
    expect(isRetryableUnconfirmedParentPackageError(error)).toBe(true)
  })

  it('keeps an unconfirmed-parent retry active on the same step even after parent confirmations increase', () => {
    const stuck = progress({
      stepIndex: 12,
      totalSteps: 27,
      nodeStatuses: [
        ...Array.from({ length: 12 }, (_, i) => ({
          txid: `step${i}`,
          confirmations: i === 11 ? 18 : 10,
          status: 'confirmed' as const,
        })),
        { txid: 'child', confirmations: 0, status: 'inProgress' },
      ],
    })
    const retry = unconfirmedParentRetryFromProgress(stuck)
    expect(retry).toEqual({ stepIndex: 12, parentConfirmationsAtFail: 18 })
    expect(unconfirmedParentRetryIsActive(retry, stuck)).toBe(true)

    const nextBlock = {
      ...stuck,
      nodeStatuses: stuck.nodeStatuses.map((node, i) =>
        i === 11 ? { ...node, confirmations: 19 } : node,
      ),
    }
    expect(unconfirmedParentRetryIsActive(retry, nextBlock)).toBe(true)
    expect(
      unconfirmedParentRetryIsActive(retry, { ...stuck, stepIndex: 13 }),
    ).toBe(false)
  })
})
