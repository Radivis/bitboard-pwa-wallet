import { describe, expect, it } from 'vitest'
import { resolveUnilateralExitControlJobState } from '@/lib/arkade/unilateral-exit-control-phase'
import type { ArkadeUnilateralExitProgress } from '@/workers/arkade-api'

function progress(
  overrides: Partial<ArkadeUnilateralExitProgress>,
): ArkadeUnilateralExitProgress {
  return {
    stepIndex: 0,
    totalSteps: 2,
    phase: 'idle',
    nodeStatuses: [],
    leafStatuses: [],
    ...overrides,
  }
}

describe('resolveUnilateralExitControlJobState', () => {
  const base = {
    progress: null,
    lifecyclePhase: 'idle' as const,
    lifecycleJobActive: false,
    hasInProgressExits: false,
    proceedPending: false,
    totalSteps: 0,
  }

  it('returns idle when no in-progress exits and no job in flight', () => {
    expect(resolveUnilateralExitControlJobState(base)).toMatchObject({
      phase: 'idle',
      exitJobInFlight: false,
      jobActive: false,
      showStepProgress: false,
    })
  })

  it('maps lifecycle waiting-confirm to waiting display phase', () => {
    expect(
      resolveUnilateralExitControlJobState({
        ...base,
        lifecyclePhase: 'waiting-confirm',
        lifecycleJobActive: true,
        totalSteps: 2,
        progress: progress({ phase: 'waiting', currentStepWaitingSince: 100 }),
      }),
    ).toMatchObject({
      phase: 'waiting',
      exitJobInFlight: true,
      showStepProgress: true,
    })
  })

  it('shows advancing when lifecycle is advancing before progress loads', () => {
    expect(
      resolveUnilateralExitControlJobState({
        ...base,
        lifecyclePhase: 'advancing',
        lifecycleJobActive: true,
        proceedPending: true,
        totalSteps: 2,
      }),
    ).toMatchObject({
      phase: 'advancing',
      exitJobInFlight: true,
      jobActive: true,
    })
  })

  it('requires all nodes confirmed before showing complete', () => {
    expect(
      resolveUnilateralExitControlJobState({
        ...base,
        lifecyclePhase: 'waiting-confirm',
        lifecycleJobActive: true,
        totalSteps: 2,
        progress: progress({
          phase: 'complete',
          nodeStatuses: [{ txid: 'aa', confirmations: 0, status: 'inProgress' }],
        }),
      }).phase,
    ).not.toBe('complete')

    expect(
      resolveUnilateralExitControlJobState({
        ...base,
        lifecyclePhase: 'complete',
        lifecycleJobActive: true,
        totalSteps: 2,
        progress: progress({
          phase: 'complete',
          nodeStatuses: [
            { txid: 'aa', confirmations: 1, status: 'confirmed' },
            { txid: 'bb', confirmations: 1, status: 'confirmed' },
          ],
        }),
      }),
    ).toMatchObject({
      phase: 'complete',
      jobActive: true,
    })
  })

  it('treats operator in-progress exits as active even without lifecycle job', () => {
    expect(
      resolveUnilateralExitControlJobState({
        ...base,
        hasInProgressExits: true,
        totalSteps: 2,
        progress: progress({ phase: 'idle', stepIndex: 1 }),
      }),
    ).toMatchObject({
      exitJobInFlight: true,
      jobActive: true,
      showStepProgress: true,
    })
  })
})
