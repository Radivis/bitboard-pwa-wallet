import { describe, expect, it } from 'vitest'
import {
  createInitialUnilateralExitContext,
  UNILATERAL_EXIT_MACHINE_STATE,
  type UnilateralExitMachineStateId,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import { unilateralExitMachine } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine'
import { selectUnilateralExitControlJobState } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-selectors'
import { toUnilateralExitActorSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-snapshot'
import type { ArkadeUnilateralExitProgress } from '@/workers/arkade-api'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  connectionId: 'conn-1',
}

const leaf = { txid: 'aa'.repeat(32), vout: 0 }

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

function resolvedSnapshot(
  value: UnilateralExitMachineStateId,
  contextOverrides: Partial<ReturnType<typeof createInitialUnilateralExitContext>> = {},
) {
  return toUnilateralExitActorSnapshot(
    unilateralExitMachine.resolveState({
      value,
      context: {
        ...createInitialUnilateralExitContext(),
        walletScope,
        ...contextOverrides,
      },
    }),
  )
}

describe('selectUnilateralExitControlJobState', () => {
  it('returns idle when no in-progress exits and no job in flight', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.idle, { jobOutpoints: [] })
    expect(
      selectUnilateralExitControlJobState(snapshot, {
        hasInProgressExits: false,
        totalSteps: 0,
      }),
    ).toMatchObject({
      phase: 'idle',
      exitJobInFlight: false,
      jobActive: false,
      showStepProgress: false,
      isProceeding: false,
    })
  })

  it('maps lifecycle waiting-confirm to waiting display phase', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'waiting',
        currentStepTxRelayed: true,
        currentStepWaitingSince: 100,
      }),
    })
    expect(
      selectUnilateralExitControlJobState(snapshot, {
        hasInProgressExits: false,
        totalSteps: 2,
      }),
    ).toMatchObject({
      phase: 'waiting',
      exitJobInFlight: true,
      showStepProgress: true,
      isProceeding: false,
    })
  })

  it('shows advancing when machine is proceeding before progress loads', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.proceeding, {
      jobOutpoints: [leaf],
      progress: null,
    })
    expect(
      selectUnilateralExitControlJobState(snapshot, {
        hasInProgressExits: false,
        totalSteps: 2,
      }),
    ).toMatchObject({
      phase: 'advancing',
      exitJobInFlight: true,
      jobActive: true,
      isProceeding: true,
    })
  })

  it('requires all nodes confirmed before showing complete', () => {
    const waitingSnapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'complete',
        nodeStatuses: [{ txid: 'aa', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(
      selectUnilateralExitControlJobState(waitingSnapshot, {
        hasInProgressExits: false,
        totalSteps: 2,
      }).phase,
    ).not.toBe('complete')

    const completeSnapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.idle, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'complete',
        nodeStatuses: [
          { txid: 'aa', confirmations: 1, status: 'confirmed' },
          { txid: 'bb', confirmations: 1, status: 'confirmed' },
        ],
      }),
    })
    expect(
      selectUnilateralExitControlJobState(completeSnapshot, {
        hasInProgressExits: true,
        totalSteps: 2,
      }),
    ).toMatchObject({
      phase: 'complete',
      jobActive: true,
    })
  })

  it('treats operator in-progress exits as active even without lifecycle job', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.idle, {
      jobOutpoints: [],
      progress: progress({ phase: 'idle', stepIndex: 1 }),
    })
    expect(
      selectUnilateralExitControlJobState(snapshot, {
        hasInProgressExits: true,
        totalSteps: 2,
      }),
    ).toMatchObject({
      exitJobInFlight: true,
      jobActive: true,
      showStepProgress: true,
    })
  })
})
