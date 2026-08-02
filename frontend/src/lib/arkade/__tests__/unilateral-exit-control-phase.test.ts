import { describe, expect, it } from 'vitest'
import { resolveUnilateralExitInProgressOverlay } from '@/lib/arkade/unilateral-exit-control-phase'
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

describe('resolveUnilateralExitInProgressOverlay', () => {
  it('returns waiting overlay during confirmation wait', () => {
    expect(
      resolveUnilateralExitInProgressOverlay({
        phase: 'waiting',
        progress: progress({
          phase: 'waiting',
          currentStepTxRelayed: true,
          currentStepWaitingSince: 100,
        }),
        isEnsuringBroadcast: false,
      }),
    ).toBe('waiting')
  })

  it('returns ensuringBroadcast overlay while the machine is ensuring broadcast', () => {
    expect(
      resolveUnilateralExitInProgressOverlay({
        phase: 'advancing',
        progress: progress({ phase: 'waiting', currentStepTxRelayed: false }),
        isEnsuringBroadcast: true,
      }),
    ).toBe('ensuringBroadcast')
  })

  it('returns ensuringBroadcast overlay when the active step is not yet relayed', () => {
    expect(
      resolveUnilateralExitInProgressOverlay({
        phase: 'advancing',
        progress: progress({ phase: 'waiting', currentStepTxRelayed: false }),
        isEnsuringBroadcast: false,
      }),
    ).toBe('ensuringBroadcast')
  })

  it('returns waiting overlay when progress is waiting even if display phase is still advancing', () => {
    expect(
      resolveUnilateralExitInProgressOverlay({
        phase: 'advancing',
        progress: progress({
          phase: 'waiting',
          currentStepTxRelayed: true,
          currentStepWaitingSince: 100,
        }),
        isEnsuringBroadcast: false,
      }),
    ).toBe('waiting')
  })

  it('returns null during generic advancing before progress reflects the active step', () => {
    expect(
      resolveUnilateralExitInProgressOverlay({
        phase: 'advancing',
        progress: null,
        isEnsuringBroadcast: false,
      }),
    ).toBeNull()
  })
})
