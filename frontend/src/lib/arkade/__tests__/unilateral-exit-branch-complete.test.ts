import { describe, expect, it } from 'vitest'
import {
  areAllJobLeavesUnrolled,
  isUnilateralExitBranchComplete,
  isUnilateralExitJobComplete,
  mapWasmProgressToLifecyclePhase,
} from '@/lib/arkade/unilateral-exit-branch-complete'
import type { ArkadeUnilateralExitProgress } from '@/workers/arkade-api'

const leafTxid = 'aa'.repeat(32)

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
          stepIndex: 2,
          totalSteps: 2,
          nodeStatuses: [
            { txid: 'aa', confirmations: 1, status: 'confirmed' },
            { txid: 'bb', confirmations: 1, status: 'confirmed' },
          ],
        }),
      ),
    ).toBe(true)
  })

  it('areAllJobLeavesUnrolled requires every selected leaf txid unrolled', () => {
    const jobOutpoints = [{ txid: leafTxid, vout: 0 }]
    expect(
      areAllJobLeavesUnrolled(jobOutpoints, [
        { txid: leafTxid, vout: 0, confirmations: 6, isUnrolled: true },
      ]),
    ).toBe(true)
    expect(
      areAllJobLeavesUnrolled(jobOutpoints, [
        { txid: leafTxid, vout: 0, confirmations: 0, isUnrolled: false },
      ]),
    ).toBe(false)
    expect(areAllJobLeavesUnrolled([], [{ txid: leafTxid, vout: 0, confirmations: 6, isUnrolled: true }])).toBe(
      false,
    )
  })

  it('isUnilateralExitJobComplete requires phase complete and unrolled leaves', () => {
    const jobOutpoints = [
      { txid: leafTxid, vout: 0 },
      { txid: leafTxid, vout: 1 },
    ]
    expect(
      isUnilateralExitJobComplete(
        progress({
          phase: 'complete',
          stepIndex: 2,
          totalSteps: 2,
          nodeStatuses: [
            { txid: 'aa', confirmations: 1, status: 'confirmed' },
            { txid: 'bb', confirmations: 1, status: 'confirmed' },
          ],
          leafStatuses: [{ txid: leafTxid, vout: 0, confirmations: 6, isUnrolled: true }],
        }),
        jobOutpoints,
      ),
    ).toBe(true)
    expect(
      isUnilateralExitJobComplete(
        progress({
          phase: 'complete',
          stepIndex: 2,
          totalSteps: 2,
          nodeStatuses: [
            { txid: 'aa', confirmations: 1, status: 'confirmed' },
            { txid: 'bb', confirmations: 1, status: 'confirmed' },
          ],
          leafStatuses: [{ txid: leafTxid, vout: 0, confirmations: 0, isUnrolled: false }],
        }),
        jobOutpoints,
      ),
    ).toBe(false)
    expect(
      isUnilateralExitJobComplete(
        progress({
          phase: 'idle',
          stepIndex: 2,
          totalSteps: 7,
          currentStepTxRelayed: false,
          nodeStatuses: [
            { txid: 'step0', confirmations: 1, status: 'confirmed' },
            { txid: 'step1', confirmations: 1, status: 'confirmed' },
            { txid: 'step2', confirmations: 0, status: 'inProgress' },
          ],
          leafStatuses: [{ txid: leafTxid, vout: 0, confirmations: 0, isUnrolled: true }],
        }),
        jobOutpoints,
      ),
    ).toBe(false)
  })

  it('maps waiting phase to waiting-confirm', () => {
    expect(
      mapWasmProgressToLifecyclePhase(
        progress({ phase: 'waiting', currentStepWaitingSince: 100 }),
      ),
    ).toBe('waiting-confirm')
  })
})
