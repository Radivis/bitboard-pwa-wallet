import { describe, expect, it } from 'vitest'
import {
  isUnilateralExitBranchComplete,
  mapWasmProgressToLifecyclePhase,
} from '@/lib/arkade/unilateral-exit-branch-complete'
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

describe('unilateral-exit-branch-complete', () => {
  it('returns false when phase is not complete', () => {
    expect(
      isUnilateralExitBranchComplete(
        progress({
          phase: 'waiting',
          nodeStatuses: [{ txid: 'aa', confirmations: 1, status: 'confirmed' }],
        }),
      ),
    ).toBe(false)
  })

  it('returns true when complete and all nodes confirmed', () => {
    expect(
      isUnilateralExitBranchComplete(
        progress({
          phase: 'complete',
          nodeStatuses: [
            { txid: 'aa', confirmations: 1, status: 'confirmed' },
            { txid: 'bb', confirmations: 1, status: 'confirmed' },
          ],
        }),
      ),
    ).toBe(true)
  })

  it('maps waiting phase to waiting-confirm', () => {
    expect(
      mapWasmProgressToLifecyclePhase(
        progress({ phase: 'waiting', currentStepWaitingSince: 100 }),
      ),
    ).toBe('waiting-confirm')
  })
})
