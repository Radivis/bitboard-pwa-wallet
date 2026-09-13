import { describe, expect, it } from 'vitest'
import { isUnilateralExitAwaitingStepConfirmation } from '@/lib/arkade/unilateral-exit-step-confirmation'

describe('isUnilateralExitAwaitingStepConfirmation', () => {
  const base = {
    phase: 'idle',
    currentStepWaitingSince: null,
    proceedMutationPending: false,
    awaitingConfirmationStepIndex: null,
    stepIndex: 0,
    nodeStatuses: [{ txid: 'aa', confirmations: 0, status: 'inProgress' as const }],
    automationJobActive: false,
    automationPausedReason: null,
  }

  it('returns true while the proceed mutation is pending', () => {
    expect(
      isUnilateralExitAwaitingStepConfirmation({
        ...base,
        proceedMutationPending: true,
      }),
    ).toBe(true)
  })

  it('returns true when progress reports waiting', () => {
    expect(
      isUnilateralExitAwaitingStepConfirmation({
        ...base,
        phase: 'waiting',
        currentStepWaitingSince: 1_700_000_000,
      }),
    ).toBe(true)
  })

  it('returns true while a submitted step index is not confirmed yet', () => {
    expect(
      isUnilateralExitAwaitingStepConfirmation({
        ...base,
        awaitingConfirmationStepIndex: 0,
        stepIndex: 0,
        nodeStatuses: [{ txid: 'aa', confirmations: 0, status: 'inProgress' }],
      }),
    ).toBe(true)
  })

  it('returns false once the submitted step is confirmed', () => {
    expect(
      isUnilateralExitAwaitingStepConfirmation({
        ...base,
        awaitingConfirmationStepIndex: 0,
        stepIndex: 0,
        nodeStatuses: [{ txid: 'aa', confirmations: 1, status: 'confirmed' }],
      }),
    ).toBe(false)
  })

  it('returns true while automation is actively running', () => {
    expect(
      isUnilateralExitAwaitingStepConfirmation({
        ...base,
        automationJobActive: true,
        phase: 'idle',
      }),
    ).toBe(true)
  })

  it('returns false when automation is paused', () => {
    expect(
      isUnilateralExitAwaitingStepConfirmation({
        ...base,
        automationJobActive: true,
        automationPausedReason: 'error',
      }),
    ).toBe(false)
  })
})
