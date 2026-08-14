import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence', () => ({
  persistActiveUnilateralExitJob: vi.fn(),
  clearPersistedUnilateralExitJob: vi.fn(),
  updatePersistedUnilateralExitRelayWait: vi.fn(),
  getPersistedUnilateralExitJob: vi.fn(() => ({
    jobActive: false,
    selectedLeafOutpoints: [],
    currentStepRelayedSinceUnix: null,
    jobStartedAtUnix: 1_700_000_000,
  })),
  useUnilateralExitLifecyclePersistenceStore: {
    getState: () => ({
      getJob: () => ({
        jobActive: false,
        selectedLeafOutpoints: [],
        currentStepRelayedSinceUnix: null,
        jobStartedAtUnix: 1_700_000_000,
      }),
    }),
    setState: vi.fn(),
  },
}))

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-failure-persistence', () => ({
  buildPersistedUnilateralExitFailure: vi.fn((params) => ({
    ...params,
    detectedAtUnix: 1_700_000_100,
  })),
  persistUnilateralExitFailureRecord: vi.fn(),
  clearPersistedUnilateralExitFailure: vi.fn(),
  getPersistedUnilateralExitFailure: vi.fn(() => null),
  useUnilateralExitFailurePersistenceStore: {
    getState: () => ({
      getFailure: () => null,
      persistFailure: vi.fn(),
      clearFailure: vi.fn(),
    }),
  },
}))

import { createActor, fromPromise, waitFor } from 'xstate'
import type {
  ArkadeUnilateralExitJobViability,
  ArkadeUnilateralExitProgress,
} from '@/workers/arkade-api'
import {
  unilateralExitMachine,
  type EnsureBroadcastActorInput,
  type EvaluateAutomationPolicyActorInput,
  type EvaluateJobViabilityActorInput,
  type FetchProgressActorInput,
  type ProceedStepActorInput,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine'
import type { UnilateralExitPolicyEvaluation } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import {
  clearPersistedUnilateralExitJob,
  persistActiveUnilateralExitJob,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import { persistUnilateralExitFailureRecord } from '@/lib/wallet/lifecycle/unilateral-exit-failure-persistence'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  connectionId: 'conn-1',
}

const leaf = { txid: 'aa'.repeat(32), vout: 0 }

function unrolledLeafStatus() {
  return {
    txid: leaf.txid,
    vout: leaf.vout,
    confirmations: 6,
    isUnrolled: true,
  }
}

function progress(
  overrides: Partial<ArkadeUnilateralExitProgress>,
): ArkadeUnilateralExitProgress {
  return {
    stepIndex: 0,
    totalSteps: 2,
    phase: 'idle',
    currentStepTxRelayed: false,
    nodeStatuses: [{ txid: 'step0', confirmations: 0, status: 'inProgress' }],
    leafStatuses: [],
    ...overrides,
  }
}

function createTestActor(params: {
  fetchProgress?: (input: FetchProgressActorInput) => Promise<ArkadeUnilateralExitProgress>
  evaluateJobViability?: (
    input: EvaluateJobViabilityActorInput,
  ) => Promise<ArkadeUnilateralExitJobViability>
  proceedStep?: (input: ProceedStepActorInput) => Promise<ArkadeUnilateralExitProgress>
  ensureBroadcast?: (input: EnsureBroadcastActorInput) => Promise<ArkadeUnilateralExitProgress>
  evaluatePolicy?: (
    input: EvaluateAutomationPolicyActorInput,
  ) => Promise<UnilateralExitPolicyEvaluation>
}) {
  const fetchProgress =
    params.fetchProgress ?? vi.fn(async () => progress({ phase: 'idle' }))
  const evaluateJobViability =
    params.evaluateJobViability ??
    vi.fn(async () => ({
      status: 'ok' as const,
      reasonCode: 'ok',
      offendingOutpoints: [],
    }))
  const proceedStep =
    params.proceedStep ??
    vi.fn(async () =>
      progress({
        phase: 'waiting',
        currentStepTxRelayed: false,
      }),
    )
  const ensureBroadcast =
    params.ensureBroadcast ??
    vi.fn(async () =>
      progress({
        phase: 'waiting',
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
      }),
    )
  const evaluatePolicy =
    params.evaluatePolicy ??
    vi.fn(async () => ({
      feeRateSatPerVb: 2,
      pausedReason: null,
    }))

  const testActor = createActor(
    unilateralExitMachine.provide({
      actors: {
        fetchProgressActor: fromPromise(fetchProgress),
        evaluateJobViabilityActor: fromPromise(evaluateJobViability),
        proceedStepActor: fromPromise(proceedStep),
        ensureBroadcastActor: fromPromise(ensureBroadcast),
        evaluateAutomationPolicyActor: fromPromise(evaluatePolicy),
      },
    }),
    { input: { pollDelayMs: 60_000 } },
  )
  testActor.start()
  return {
    testActor,
    fetchProgress,
    evaluateJobViability,
    proceedStep,
    ensureBroadcast,
    evaluatePolicy,
  }
}

describe('unilateralExitMachine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('manual start ensures broadcast before waiting when step is idle and unrelayed', async () => {
    const fetchProgress = vi.fn(async () => progress({ phase: 'idle' }))
    const proceedStep = vi.fn()
    const ensureBroadcast = vi.fn(async () =>
      progress({
        phase: 'waiting',
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
      }),
    )
    const { testActor } = createTestActor({ fetchProgress, proceedStep, ensureBroadcast })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    expect(proceedStep).not.toHaveBeenCalled()
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)
    expect(persistActiveUnilateralExitJob).toHaveBeenCalled()
    expect(testActor.getSnapshot().context.progress?.currentStepTxRelayed).toBe(true)
  })

  it('manual proceed uses proceeding then ensuring broadcast when step is already relayed', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({ phase: 'idle', currentStepTxRelayed: true }),
    )
    const proceedStep = vi.fn(async () =>
      progress({
        phase: 'waiting',
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
      }),
    )
    const ensureBroadcast = vi.fn(async (input) =>
      progress({
        phase: 'waiting',
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
      }),
    )
    const { testActor } = createTestActor({ fetchProgress, proceedStep, ensureBroadcast })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    expect(proceedStep).toHaveBeenCalledTimes(1)
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)
  })

  it('enters waitingConfirm after ensureBroadcast when relayed but waiting stamp is absent', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'waiting',
        currentStepTxRelayed: false,
      }),
    )
    const proceedStep = vi.fn()
    const ensureBroadcast = vi.fn(async () =>
      progress({
        phase: 'waiting',
        currentStepTxRelayed: true,
      }),
    )
    const { testActor } = createTestActor({ fetchProgress, proceedStep, ensureBroadcast })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)
    expect(testActor.getSnapshot().context.progress?.currentStepWaitingSince).toBeUndefined()
  })

  it('pre-broadcast waiting routes to ensuringBroadcast instead of waitingConfirm', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'waiting',
        currentStepTxRelayed: false,
      }),
    )
    const proceedStep = vi.fn()
    const ensureBroadcast = vi.fn(async () =>
      progress({
        phase: 'waiting',
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
      }),
    )
    const { testActor } = createTestActor({ fetchProgress, proceedStep, ensureBroadcast })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    expect(proceedStep).not.toHaveBeenCalled()
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)
  })

  it('marks job complete when all selected leaves are unrolled', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'complete',
        stepIndex: 2,
        totalSteps: 2,
        currentStepTxRelayed: true,
        nodeStatuses: [
          { txid: 'step0', confirmations: 1, status: 'confirmed' },
          { txid: 'step1', confirmations: 1, status: 'confirmed' },
        ],
        leafStatuses: [unrolledLeafStatus()],
      }),
    )
    const proceedStep = vi.fn()
    const { testActor } = createTestActor({ fetchProgress, proceedStep })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('complete'))
    expect(proceedStep).not.toHaveBeenCalled()
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalled()
  })

  it('clearJob resets persisted job', async () => {
    const { testActor } = createTestActor({})
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    testActor.send({ type: 'CLEAR_JOB' })
    expect(testActor.getSnapshot().matches('idle')).toBe(true)
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalled()
  })

  it('hydrate completes when all selected leaves are unrolled', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'complete',
        stepIndex: 2,
        totalSteps: 2,
        currentStepTxRelayed: true,
        nodeStatuses: [
          { txid: 'step0', confirmations: 1, status: 'confirmed' },
          { txid: 'step1', confirmations: 1, status: 'confirmed' },
        ],
        leafStatuses: [unrolledLeafStatus()],
      }),
    )
    const proceedStep = vi.fn()
    const { testActor } = createTestActor({ fetchProgress, proceedStep })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'HYDRATE_OR_START',
      walletScope,
      outpoints: [leaf],
      automationEnabled: true,
    })
    await waitFor(testActor, (state) => state.matches('complete'))
    expect(proceedStep).not.toHaveBeenCalled()
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalled()
  })

  it('automation fee cap pauses', async () => {
    const { testActor } = createTestActor({
      evaluatePolicy: vi.fn(async () => ({
        feeRateSatPerVb: 20,
        pausedReason: 'feeCapExceeded' as const,
      })),
    })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_AUTOMATIC',
      walletScope,
      outpoints: [leaf],
    })
    await waitFor(testActor, (state) => state.matches('paused'))
    expect(testActor.getSnapshot().context.pausedReason).toBe('feeCapExceeded')
  })

  it('automation bumper insufficient pauses', async () => {
    const { testActor } = createTestActor({
      evaluatePolicy: vi.fn(async () => ({
        feeRateSatPerVb: 2,
        pausedReason: 'bumperInsufficient' as const,
      })),
    })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_AUTOMATIC',
      walletScope,
      outpoints: [leaf],
    })
    await waitFor(testActor, (state) => state.matches('paused'))
    expect(testActor.getSnapshot().context.pausedReason).toBe('bumperInsufficient')
  })

  it('enables automation mid-job while waiting for confirmation', async () => {
    const fetchProgress = vi.fn(async () => progress({ phase: 'idle' }))
    const { testActor } = createTestActor({ fetchProgress })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(testActor, (state) => state.matches('waitingConfirm'))

    testActor.send({ type: 'AUTOMATION_PREFS_CHANGED', automationEnabled: true })
    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    const snapshot = testActor.getSnapshot()
    expect(snapshot.context.automationEnabled).toBe(true)
    expect(snapshot.context.progress?.currentStepTxRelayed).toBe(true)
  })

  it('disables automation mid-job without clearing outpoints', async () => {
    const { testActor } = createTestActor({})
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_AUTOMATIC',
      walletScope,
      outpoints: [leaf],
    })
    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    testActor.send({ type: 'AUTOMATION_PREFS_CHANGED', automationEnabled: false })
    const snapshot = testActor.getSnapshot()
    expect(snapshot.context.automationEnabled).toBe(false)
    expect(snapshot.context.jobOutpoints).toEqual([leaf])
  })

  it('lock reset returns to notConfigured', async () => {
    const { testActor } = createTestActor({})
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({ type: 'WALLET_RESET' })
    expect(testActor.getSnapshot().matches('notConfigured')).toBe(true)
  })

  it('manual waitingConfirm poll does not set proceedRequested', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'idle',
        currentStepTxRelayed: true,
      }),
    )
    const proceedStep = vi.fn()
    const { testActor } = createTestActor({ fetchProgress, proceedStep })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    expect(testActor.getSnapshot().context.automationEnabled).toBe(false)
    proceedStep.mockClear()

    testActor.send({ type: 'POLL_TICK' })
    await waitFor(testActor, (state) => state.matches('idle'))
    expect(testActor.getSnapshot().context.proceedRequested).toBe(false)
    expect(proceedStep).not.toHaveBeenCalled()
  })

  it('does not complete when selected leaves are not unrolled', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'complete',
        stepIndex: 2,
        totalSteps: 2,
        currentStepTxRelayed: true,
        nodeStatuses: [
          { txid: 'step0', confirmations: 1, status: 'confirmed' },
          { txid: 'step1', confirmations: 0, status: 'inProgress' },
        ],
        leafStatuses: [
          { txid: leaf.txid, vout: leaf.vout, confirmations: 0, isUnrolled: false },
        ],
      }),
    )
    const proceedStep = vi.fn()
    const { testActor } = createTestActor({ fetchProgress, proceedStep })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('idle'))
    expect(testActor.getSnapshot().matches('complete')).toBe(false)
    expect(proceedStep).not.toHaveBeenCalled()
    expect(clearPersistedUnilateralExitJob).not.toHaveBeenCalled()
  })

  it('does not complete when WASM branch is complete but leaves are not unrolled', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'complete',
        stepIndex: 2,
        totalSteps: 2,
        currentStepTxRelayed: true,
        nodeStatuses: [
          { txid: 'step0', confirmations: 1, status: 'confirmed' },
          { txid: 'step1', confirmations: 1, status: 'confirmed' },
        ],
        leafStatuses: [
          { txid: leaf.txid, vout: leaf.vout, confirmations: 0, isUnrolled: false },
        ],
      }),
    )
    const { testActor } = createTestActor({ fetchProgress })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('idle'))
    expect(testActor.getSnapshot().matches('complete')).toBe(false)
    expect(clearPersistedUnilateralExitJob).not.toHaveBeenCalled()
  })

  it('completes when all leaves unrolled even if operator reports in-progress exits', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'complete',
        stepIndex: 2,
        totalSteps: 2,
        currentStepTxRelayed: true,
        nodeStatuses: [
          { txid: 'step0', confirmations: 1, status: 'confirmed' },
          { txid: 'step1', confirmations: 1, status: 'confirmed' },
        ],
        leafStatuses: [unrolledLeafStatus()],
      }),
    )
    const { testActor } = createTestActor({ fetchProgress })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'HYDRATE_OR_START',
      walletScope,
      outpoints: [leaf],
      automationEnabled: false,
      reconcileInProgressSats: 50_000,
      reconcileInProgressOutpoints: [leaf],
    })

    await waitFor(testActor, (state) => state.matches('complete'))
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalled()
  })

  it('terminates job when viability reports asp swept targets', async () => {
    const evaluateJobViability = vi.fn(async () => ({
      status: 'aspSweptTargets' as const,
      reasonCode: 'asp_swept_targets',
      detailMessage: 'Operator swept target VTXO.',
      offendingOutpoints: [leaf],
    }))
    const fetchProgress = vi.fn(async () => progress({ phase: 'idle' }))
    const { testActor } = createTestActor({ evaluateJobViability, fetchProgress })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('idle'))
    expect(evaluateJobViability).toHaveBeenCalledTimes(1)
    expect(fetchProgress).not.toHaveBeenCalled()
    expect(persistUnilateralExitFailureRecord).toHaveBeenCalled()
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalled()
    expect(testActor.getSnapshot().context.jobOutpoints).toEqual([])
  })

  it('aborts from proceeding and persists user_aborted failure', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({ phase: 'idle', currentStepTxRelayed: true }),
    )
    const proceedStep = vi.fn(() => new Promise<ArkadeUnilateralExitProgress>(() => {}))
    const { testActor } = createTestActor({ fetchProgress, proceedStep })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('proceeding'))
    testActor.send({ type: 'ABORT_ORCHESTRATION', vtxoIds: ['vtxo-id-1'] })

    await waitFor(testActor, (state) => state.matches('idle'))
    expect(persistUnilateralExitFailureRecord).toHaveBeenCalledWith(
      walletScope,
      expect.objectContaining({
        reasonCode: 'user_aborted',
        vtxoIds: ['vtxo-id-1'],
      }),
    )
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalled()
    expect(testActor.getSnapshot().context.jobOutpoints).toEqual([])
  })

  it('aborts from waitingConfirm and clears job context', async () => {
    const fetchProgress = vi.fn(async () => progress({ phase: 'idle' }))
    const { testActor } = createTestActor({ fetchProgress })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    testActor.send({ type: 'ABORT_ORCHESTRATION', vtxoIds: ['vtxo-a', 'vtxo-b'] })

    await waitFor(testActor, (state) => state.matches('idle'))
    expect(persistUnilateralExitFailureRecord).toHaveBeenCalledWith(
      walletScope,
      expect.objectContaining({
        reasonCode: 'user_aborted',
        vtxoIds: ['vtxo-a', 'vtxo-b'],
      }),
    )
    expect(testActor.getSnapshot().context.jobOutpoints).toEqual([])
  })
})
