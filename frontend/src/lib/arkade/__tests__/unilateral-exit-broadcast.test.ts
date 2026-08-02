import { describe, expect, it } from 'vitest'
import {
  isCurrentStepRelayed,
  isWaitingForRelayedStepConfirmation,
  needsBroadcastEnsurance,
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
})
