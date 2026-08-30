import { describe, expect, it } from 'vitest'
import {
  createInitialUnilateralExitContext,
  UNILATERAL_EXIT_MACHINE_STATE,
  type UnilateralExitMachineStateId,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import { unilateralExitMachine } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine'
import {
  selectIsUnilateralExitJobActive,
  selectCanAbortUnilateralExitOrchestration,
  selectUnilateralExitControlJobState,
  selectUnilateralExitInProgressOverlay,
  selectUnilateralExitLifecycleSnapshot,
  selectUnilateralExitProceedButtonState,
  selectUnilateralExitProgressForDisplay,
  selectUnilateralExitAutomationSnapshot,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-selectors'
import { UnilateralExitLifecyclePhase } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
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

  it('maps waitingForParentData to parent-data display phase', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.waitingForParentData, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'idle',
        currentStepTxRelayed: false,
      }),
    })
    expect(
      selectUnilateralExitControlJobState(snapshot, {
        hasInProgressExits: false,
        totalSteps: 2,
      }),
    ).toMatchObject({
      phase: 'waitingForParentData',
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

  it('maps ensuringBroadcast to its own display phase', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.ensuringBroadcast, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'waiting',
        currentStepTxRelayed: false,
      }),
    })
    expect(
      selectUnilateralExitControlJobState(snapshot, {
        hasInProgressExits: false,
        totalSteps: 2,
      }),
    ).toMatchObject({
      phase: 'ensuringBroadcast',
      exitJobInFlight: true,
      jobActive: true,
      isProceeding: true,
    })
  })

  it('shows complete when machine is complete even if progress snapshot looks incomplete', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.complete, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'idle',
        stepIndex: 1,
        totalSteps: 5,
        nodeStatuses: [{ txid: 'aa', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(
      selectUnilateralExitControlJobState(snapshot, {
        hasInProgressExits: false,
        totalSteps: 5,
      }).phase,
    ).toBe('complete')
  })

  it('does not infer complete from progress while machine is still waiting', () => {
    const waitingSnapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'complete',
        stepIndex: 2,
        totalSteps: 2,
        nodeStatuses: [{ txid: 'aa', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(
      selectUnilateralExitControlJobState(waitingSnapshot, {
        hasInProgressExits: false,
        totalSteps: 2,
      }).phase,
    ).not.toBe('complete')

    const completeSnapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.complete, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'complete',
        stepIndex: 2,
        totalSteps: 2,
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

  it('selectUnilateralExitProgressForDisplay is null while a job is scoped without actor progress', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.proceeding, {
      jobOutpoints: [leaf],
      progress: null,
    })
    expect(selectUnilateralExitProgressForDisplay(snapshot)).toBeNull()
  })

  it('selectUnilateralExitProceedButtonState disables during waiting', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm, {
      jobOutpoints: [leaf],
      automationEnabled: false,
      progress: progress({
        phase: 'waiting',
        currentStepTxRelayed: true,
        currentStepWaitingSince: 100,
      }),
    })
    const button = selectUnilateralExitProceedButtonState(snapshot, {
      jobOutpointsCount: 1,
      automationEnabled: false,
      bumperLow: false,
      batchEstimateLoading: false,
      prefsHydrated: true,
      lifecycleJobActive: true,
      hasInProgressExits: true,
      phase: 'waiting',
    })
    expect(button.disabled).toBe(true)
    expect(button.canProceedStep).toBe(true)
  })

  it('selectUnilateralExitProceedButtonState disables during advancing', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.proceeding, {
      jobOutpoints: [leaf],
      progress: null,
    })
    const button = selectUnilateralExitProceedButtonState(snapshot, {
      jobOutpointsCount: 1,
      automationEnabled: false,
      bumperLow: false,
      batchEstimateLoading: false,
      prefsHydrated: true,
      lifecycleJobActive: true,
      hasInProgressExits: true,
      phase: 'advancing',
    })
    expect(button.disabled).toBe(true)
    expect(button.showSpinner).toBe(true)
  })

  it('keeps a job with outpoints active after a start error so retry is Proceed', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.error, {
      jobOutpoints: [leaf],
      lastErrorMessage: 'Transaction not found',
    })
    expect(selectIsUnilateralExitJobActive(snapshot)).toBe(true)
    expect(
      selectUnilateralExitProceedButtonState(snapshot, {
        jobOutpointsCount: 1,
        automationEnabled: false,
        bumperLow: false,
        batchEstimateLoading: false,
        prefsHydrated: true,
        lifecycleJobActive: true,
        hasInProgressExits: false,
        phase: 'idle',
      }).label,
    ).toBe('Proceed')
  })

  it('does not treat leftover WASM in-progress as an unroll job', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.idle, {
      jobOutpoints: [],
      progress: null,
    })
    expect(
      selectUnilateralExitControlJobState(snapshot, {
        hasInProgressExits: true,
        totalSteps: 17,
      }),
    ).toMatchObject({
      phase: 'idle',
      exitJobInFlight: false,
      jobActive: false,
      showStepProgress: false,
    })
  })

  it('maps idle and error jobs from machine state, not WASM waiting', () => {
    const waitingProgress = progress({
      phase: 'waiting',
      currentStepTxRelayed: true,
      currentStepWaitingSince: 1_700_000_000,
    })
    expect(
      selectUnilateralExitControlJobState(
        resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.idle, {
          jobOutpoints: [leaf],
          progress: waitingProgress,
        }),
        { hasInProgressExits: false, totalSteps: 2 },
      ).phase,
    ).toBe('idle')
    expect(
      selectUnilateralExitControlJobState(
        resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.error, {
          jobOutpoints: [leaf],
          lastErrorMessage: 'broadcast failed',
          progress: waitingProgress,
        }),
        { hasInProgressExits: false, totalSteps: 2 },
      ).phase,
    ).toBe('idle')
  })

  it('maps paused, aborted, and terminated to idle display', () => {
    expect(
      selectUnilateralExitControlJobState(
        resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.paused, {
          jobOutpoints: [leaf],
          pausedReason: 'feeCapExceeded',
          progress: progress({ phase: 'waiting', currentStepTxRelayed: true }),
        }),
        { hasInProgressExits: false, totalSteps: 2 },
      ).phase,
    ).toBe('idle')
    expect(
      selectUnilateralExitControlJobState(
        resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.aborted, {
          jobOutpoints: [leaf],
        }),
        { hasInProgressExits: false, totalSteps: 2 },
      ).phase,
    ).toBe('idle')
    expect(
      selectUnilateralExitControlJobState(
        resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.terminated, {
          jobOutpoints: [leaf],
        }),
        { hasInProgressExits: false, totalSteps: 2 },
      ).phase,
    ).toBe('idle')
  })

  it('maps evaluatingPolicy to advancing', () => {
    expect(
      selectUnilateralExitControlJobState(
        resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.evaluatingPolicy, {
          jobOutpoints: [leaf],
          progress: progress({ phase: 'idle' }),
        }),
        { hasInProgressExits: false, totalSteps: 2 },
      ).phase,
    ).toBe('advancing')
  })

  it('keeps waitingForParentData while progress-refreshing the parent-data retry', () => {
    expect(
      selectUnilateralExitControlJobState(
        resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.checkingProgress, {
          jobOutpoints: [leaf],
          progressRefreshRequested: true,
          unconfirmedParentRetry: { stepIndex: 14, parentConfirmationsAtFail: 3 },
          progress: progress({ phase: 'idle', stepIndex: 14, totalSteps: 27 }),
        }),
        { hasInProgressExits: false, totalSteps: 27 },
      ).phase,
    ).toBe('waitingForParentData')
  })
})

describe('selectUnilateralExitInProgressOverlay', () => {
  it('returns pickaxe overlay in waitingConfirm', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'waiting',
        currentStepTxRelayed: true,
        currentStepWaitingSince: 100,
        nodeStatuses: [{ txid: 'step0', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(selectUnilateralExitInProgressOverlay(snapshot)).toBe('waiting')
  })

  it('returns megaphone overlay in ensuringBroadcast', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.ensuringBroadcast, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'waiting',
        currentStepTxRelayed: false,
        nodeStatuses: [{ txid: 'step0', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(selectUnilateralExitInProgressOverlay(snapshot)).toBe('ensuringBroadcast')
  })

  it('returns parent-data overlay in waitingForParentData', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.waitingForParentData, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'idle',
        stepIndex: 14,
        totalSteps: 27,
        currentStepTxRelayed: false,
        nodeStatuses: [{ txid: 'step14', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(selectUnilateralExitInProgressOverlay(snapshot)).toBe('waitingForParentData')
  })

  it('keeps parent-data overlay while progress-refreshing from waitingForParentData', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.checkingProgress, {
      jobOutpoints: [leaf],
      progressRefreshRequested: true,
      unconfirmedParentRetry: { stepIndex: 14, parentConfirmationsAtFail: 3 },
      progress: progress({
        phase: 'idle',
        stepIndex: 14,
        totalSteps: 27,
        currentStepTxRelayed: false,
        nodeStatuses: [{ txid: 'step14', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(selectUnilateralExitInProgressOverlay(snapshot)).toBe('waitingForParentData')
  })

  it('does not keep pickaxe overlay while polling from waitingConfirm', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.checkingProgress, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'waiting',
        currentStepTxRelayed: true,
        currentStepWaitingSince: 100,
        nodeStatuses: [{ txid: 'step0', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(selectUnilateralExitInProgressOverlay(snapshot)).toBeNull()
    expect(
      selectUnilateralExitControlJobState(snapshot, {
        hasInProgressExits: false,
        totalSteps: 2,
      }).phase,
    ).toBe('advancing')
    expect(selectUnilateralExitLifecycleSnapshot(snapshot).phase).toBe(
      UnilateralExitLifecyclePhase.Advancing,
    )
  })

  it('returns null during proceeding', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.proceeding, {
      jobOutpoints: [leaf],
      progress: null,
    })
    expect(selectUnilateralExitInProgressOverlay(snapshot)).toBeNull()
  })

  it('returns null overlay when the machine is complete', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.complete, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'complete',
        stepIndex: 2,
        totalSteps: 2,
      }),
    })
    expect(selectUnilateralExitInProgressOverlay(snapshot)).toBeNull()
  })

  it('returns readyToProceed overlay when an idle job still needs a broadcast', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.idle, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'idle',
        stepIndex: 6,
        totalSteps: 7,
        currentStepTxRelayed: false,
        nodeStatuses: [{ txid: 'step6', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(selectUnilateralExitInProgressOverlay(snapshot)).toBe('readyToProceed')
  })

  it('returns readyToProceed overlay when idle on an already-relayed step that still needs confirmations', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.idle, {
      jobOutpoints: [leaf],
      progress: progress({
        phase: 'waiting',
        stepIndex: 3,
        totalSteps: 7,
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
        nodeStatuses: [{ txid: 'checkpoint', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(selectUnilateralExitInProgressOverlay(snapshot)).toBe('readyToProceed')
  })

  it('returns readyToProceed overlay when a failed broadcast can be retried', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.error, {
      jobOutpoints: [leaf],
      lastErrorMessage: 'package-not-child-with-unconfirmed-parents',
      progress: progress({
        phase: 'idle',
        currentStepTxRelayed: false,
        nodeStatuses: [{ txid: 'step6', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(selectUnilateralExitInProgressOverlay(snapshot)).toBe('readyToProceed')
  })

  it('keeps the play overlay during idle progress refresh instead of flashing megaphone', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.checkingProgress, {
      jobOutpoints: [leaf],
      progressRefreshRequested: true,
      proceedRequested: false,
      progress: progress({
        phase: 'idle',
        stepIndex: 15,
        totalSteps: 23,
        currentStepTxRelayed: false,
        nodeStatuses: [{ txid: 'ark', confirmations: 0, status: 'inProgress' }],
      }),
    })
    expect(selectUnilateralExitInProgressOverlay(snapshot)).toBe('readyToProceed')
    expect(
      selectUnilateralExitControlJobState(snapshot, {
        hasInProgressExits: false,
        totalSteps: 23,
      }),
    ).toMatchObject({
      phase: 'idle',
      isProceeding: false,
    })
  })
})

describe('selectCanAbortUnilateralExitOrchestration', () => {
  const abortParams = {
    resolvedJobOutpointsCount: 1,
    lifecycleJobActive: false,
    persistedJobExists: false,
    hasInProgressExits: false,
  }

  it('is true when actor holds job outpoints outside complete', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm, {
      jobOutpoints: [leaf],
    })
    expect(selectCanAbortUnilateralExitOrchestration(snapshot, abortParams)).toBe(true)
  })

  it('is false for leftover WASM in-progress without a frontend job', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.idle, {
      jobOutpoints: [],
    })
    expect(
      selectCanAbortUnilateralExitOrchestration(snapshot, {
        ...abortParams,
        hasInProgressExits: true,
      }),
    ).toBe(false)
  })

  it('is true when a persisted frontend job exists without WASM in-progress', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.idle, {
      jobOutpoints: [],
    })
    expect(
      selectCanAbortUnilateralExitOrchestration(snapshot, {
        ...abortParams,
        persistedJobExists: true,
      }),
    ).toBe(true)
  })

  it('is false when only leaf selection exists without orchestration or in-progress', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.idle, {
      jobOutpoints: [],
    })
    expect(selectCanAbortUnilateralExitOrchestration(snapshot, abortParams)).toBe(false)
  })

  it('is false after branch complete', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.complete, {
      jobOutpoints: [leaf],
    })
    expect(selectCanAbortUnilateralExitOrchestration(snapshot, abortParams)).toBe(false)
  })
})

describe('selectUnilateralExitLifecycleSnapshot terminated', () => {
  it('maps terminated machine state to terminated lifecycle phase', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.terminated, {
      jobOutpoints: [leaf],
    })
    expect(selectUnilateralExitLifecycleSnapshot(snapshot).phase).toBe(
      UnilateralExitLifecyclePhase.Terminated,
    )
    expect(selectIsUnilateralExitJobActive(snapshot)).toBe(false)
  })
})

describe('selectUnilateralExitAutomationSnapshot', () => {
  it('uses machine automationEnabled as the enabled bit', () => {
    const snapshot = resolvedSnapshot(UNILATERAL_EXIT_MACHINE_STATE.idle, {
      automationEnabled: true,
    })
    expect(
      selectUnilateralExitAutomationSnapshot(snapshot, {
        enabled: false,
        feePresetLabel: 'High',
        maxFeeRateSatPerVb: 20,
      }).prefs.enabled,
    ).toBe(true)
  })
})
