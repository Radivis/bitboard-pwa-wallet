import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence', () => ({
  persistActiveUnilateralExitJob: vi.fn(),
  clearPersistedUnilateralExitJob: vi.fn(),
  updatePersistedUnilateralExitRelayWait: vi.fn(),
  getPersistedUnilateralExitJob: vi.fn(() => ({
    selectedLeafOutpoints: [],
    currentStepRelayedSinceUnix: null,
    jobStartedAtUnix: 1_700_000_000,
  })),
  useUnilateralExitLifecyclePersistenceStore: {
    getState: () => ({
      getJob: () => ({
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
  getPersistedUnilateralExitFailure: vi.fn(() => ({
    selectedLeafOutpoints: [],
    jobStartedAtUnix: 1_700_000_000,
    detectedAtUnix: 1_700_000_100,
    reasonCode: 'user_aborted' as const,
    detailMessage: '',
    vtxoIds: [],
  })),
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
  type ResolveAbortVtxoIdsActorInput,
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

const startedTestActors: Array<ReturnType<typeof createActor>> = []

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
  resolveAbortVtxoIds?: (
    input: ResolveAbortVtxoIdsActorInput,
  ) => Promise<{ vtxoIds: string[] }>
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

  const resolveAbortVtxoIds =
    params.resolveAbortVtxoIds ?? vi.fn(async () => ({ vtxoIds: [] as string[] }))

  const testActor = createActor(
    unilateralExitMachine.provide({
      actors: {
        fetchProgressActor: fromPromise(fetchProgress),
        evaluateJobViabilityActor: fromPromise(evaluateJobViability),
        proceedStepActor: fromPromise(proceedStep),
        ensureBroadcastActor: fromPromise(ensureBroadcast),
        evaluateAutomationPolicyActor: fromPromise(evaluatePolicy),
        resolveAbortVtxoIdsActor: fromPromise(resolveAbortVtxoIds),
      },
    }),
    { input: { pollDelayMs: 60_000, parentDataWaitMs: 60_000 } },
  )
  testActor.start()
  startedTestActors.push(testActor)
  return {
    testActor,
    fetchProgress,
    evaluateJobViability,
    proceedStep,
    ensureBroadcast,
    evaluatePolicy,
    resolveAbortVtxoIds,
  }
}

describe('unilateralExitMachine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    for (const actor of startedTestActors) {
      actor.stop()
    }
    startedTestActors.length = 0
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

  it('does not complete when a sticky unrolled leaf flag arrives mid-unroll', async () => {
    const fetchProgress = vi.fn(async () =>
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
        leafStatuses: [unrolledLeafStatus()],
      }),
    )
    const proceedStep = vi.fn()
    const { testActor } = createTestActor({ fetchProgress, proceedStep })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf, { txid: leaf.txid, vout: 1 }],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    expect(testActor.getSnapshot().matches('complete')).toBe(false)
    expect(proceedStep).not.toHaveBeenCalled()
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

  it('hydrate in manual mode waits for Proceed when the current step is not yet broadcast', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'idle',
        stepIndex: 4,
        totalSteps: 7,
        currentStepTxRelayed: false,
      }),
    )
    const proceedStep = vi.fn()
    const ensureBroadcast = vi.fn()
    const { testActor } = createTestActor({ fetchProgress, proceedStep, ensureBroadcast })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'HYDRATE_OR_START',
      walletScope,
      outpoints: [leaf],
      automationEnabled: false,
    })
    await waitFor(testActor, (state) => state.matches('idle'))
    expect(proceedStep).not.toHaveBeenCalled()
    expect(ensureBroadcast).not.toHaveBeenCalled()
    expect(testActor.getSnapshot().context.jobOutpoints).toEqual([leaf])
    expect(testActor.getSnapshot().context.progress?.stepIndex).toBe(4)
  })

  it('does not auto-broadcast the next unrelayed step after a manual confirmation poll', async () => {
    let fetchCount = 0
    const fetchProgress = vi.fn(async () => {
      fetchCount += 1
      if (fetchCount === 1) {
        return progress({
          phase: 'idle',
          stepIndex: 4,
          totalSteps: 7,
          currentStepTxRelayed: false,
        })
      }
      return progress({
        phase: 'idle',
        stepIndex: 6,
        totalSteps: 7,
        currentStepTxRelayed: false,
      })
    })
    const proceedStep = vi.fn()
    const ensureBroadcast = vi.fn(async () =>
      progress({
        phase: 'waiting',
        stepIndex: 4,
        totalSteps: 7,
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
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)

    testActor.send({ type: 'POLL_TICK' })
    await waitFor(testActor, (state) => state.matches('idle'))
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)
    expect(proceedStep).not.toHaveBeenCalled()
    expect(testActor.getSnapshot().context.progress?.stepIndex).toBe(6)
    expect(testActor.getSnapshot().context.proceedRequested).toBe(false)
  })

  it('manual ensureBroadcast stays idle when progress jumps to an already-relayed later step', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'idle',
        stepIndex: 2,
        totalSteps: 7,
        currentStepTxRelayed: false,
      }),
    )
    const proceedStep = vi.fn()
    const ensureBroadcast = vi.fn(async () =>
      progress({
        phase: 'waiting',
        stepIndex: 3,
        totalSteps: 7,
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
    await waitFor(testActor, (state) => state.matches('idle') && state.context.progress?.stepIndex === 3)
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)
    expect(proceedStep).not.toHaveBeenCalled()
    expect(testActor.getSnapshot().matches('waitingConfirm')).toBe(false)
    expect(testActor.getSnapshot().context.proceedRequested).toBe(false)
  })

  it('manual confirmation poll stays idle when the next step is already relayed', async () => {
    let fetchCount = 0
    const fetchProgress = vi.fn(async () => {
      fetchCount += 1
      if (fetchCount === 1) {
        return progress({
          phase: 'idle',
          stepIndex: 2,
          totalSteps: 7,
          currentStepTxRelayed: false,
        })
      }
      return progress({
        phase: 'waiting',
        stepIndex: 3,
        totalSteps: 7,
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
      })
    })
    const proceedStep = vi.fn()
    const ensureBroadcast = vi.fn(async () =>
      progress({
        phase: 'waiting',
        stepIndex: 2,
        totalSteps: 7,
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
    expect(testActor.getSnapshot().context.progress?.stepIndex).toBe(2)

    testActor.send({ type: 'POLL_TICK' })
    await waitFor(testActor, (state) => state.matches('idle'))
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)
    expect(proceedStep).not.toHaveBeenCalled()
    expect(testActor.getSnapshot().context.progress?.stepIndex).toBe(3)
    expect(testActor.getSnapshot().context.proceedRequested).toBe(false)
  })

  it('does not broadcast a later ark when Proceed targeted a checkpoint that is already confirmed', async () => {
    let fetchCount = 0
    const fetchProgress = vi.fn(async () => {
      fetchCount += 1
      if (fetchCount === 1) {
        return progress({
          phase: 'waiting',
          stepIndex: 6,
          totalSteps: 23,
          currentStepTxRelayed: true,
          currentStepWaitingSince: 1_700_000_000,
        })
      }
      return progress({
        phase: 'idle',
        stepIndex: 7,
        totalSteps: 23,
        currentStepTxRelayed: false,
      })
    })
    const proceedStep = vi.fn()
    const ensureBroadcast = vi.fn()
    const { testActor } = createTestActor({ fetchProgress, proceedStep, ensureBroadcast })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    expect(testActor.getSnapshot().context.progress?.stepIndex).toBe(6)
    expect(ensureBroadcast).not.toHaveBeenCalled()

    testActor.send({ type: 'PROCEED_MANUAL', feeRateSatPerVb: 2 })
    await waitFor(testActor, (state) => state.matches('idle'))
    expect(ensureBroadcast).not.toHaveBeenCalled()
    expect(proceedStep).not.toHaveBeenCalled()
    expect(testActor.getSnapshot().context.progress?.stepIndex).toBe(7)
    expect(testActor.getSnapshot().context.proceedRequested).toBe(false)
  })

  it('idle progress refresh updates a confirmed checkpoint without broadcasting the next ark', async () => {
    let fetchCount = 0
    const fetchProgress = vi.fn(async () => {
      fetchCount += 1
      if (fetchCount === 1) {
        return progress({
          phase: 'idle',
          stepIndex: 5,
          totalSteps: 23,
          currentStepTxRelayed: false,
        })
      }
      return progress({
        phase: 'idle',
        stepIndex: 7,
        totalSteps: 23,
        currentStepTxRelayed: false,
      })
    })
    const proceedStep = vi.fn()
    const ensureBroadcast = vi.fn(async () =>
      progress({
        phase: 'waiting',
        stepIndex: 6,
        totalSteps: 23,
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
    await waitFor(testActor, (state) => state.matches('idle') && state.context.progress?.stepIndex === 6)
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)

    testActor.send({ type: 'POLL_TICK' })
    await waitFor(testActor, (state) => state.matches('idle') && state.context.progress?.stepIndex === 7)
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)
    expect(proceedStep).not.toHaveBeenCalled()
    expect(testActor.getSnapshot().context.proceedRequested).toBe(false)
  })

  it('automatic mode continues when ensureBroadcast advances to an unrelayed later step', async () => {
    let ensureCount = 0
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'idle',
        stepIndex: ensureCount < 1 ? 2 : 3,
        totalSteps: 7,
        currentStepTxRelayed: false,
      }),
    )
    const ensureBroadcast = vi.fn(async () => {
      ensureCount += 1
      if (ensureCount === 1) {
        return progress({
          phase: 'idle',
          stepIndex: 3,
          totalSteps: 7,
          currentStepTxRelayed: false,
        })
      }
      return progress({
        phase: 'waiting',
        stepIndex: 3,
        totalSteps: 7,
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
      })
    })
    const { testActor } = createTestActor({ fetchProgress, ensureBroadcast })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_AUTOMATIC',
      walletScope,
      outpoints: [leaf],
    })
    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    expect(ensureBroadcast).toHaveBeenCalledTimes(2)
    expect(testActor.getSnapshot().context.progress?.stepIndex).toBe(3)
    expect(testActor.getSnapshot().context.automationEnabled).toBe(true)
  })

  it('automatic mode still waits when ensureBroadcast advances to an already-relayed later step', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'idle',
        stepIndex: 2,
        totalSteps: 7,
        currentStepTxRelayed: false,
      }),
    )
    const ensureBroadcast = vi.fn(async () =>
      progress({
        phase: 'waiting',
        stepIndex: 3,
        totalSteps: 7,
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
      }),
    )
    const { testActor } = createTestActor({ fetchProgress, ensureBroadcast })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_AUTOMATIC',
      walletScope,
      outpoints: [leaf],
    })
    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    expect(testActor.getSnapshot().context.progress?.stepIndex).toBe(3)
    expect(ensureBroadcast).toHaveBeenCalled()
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

  it('WALLET_RESET from waitingConfirm returns to notConfigured', async () => {
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

    testActor.send({ type: 'WALLET_RESET' })
    expect(testActor.getSnapshot().matches('notConfigured')).toBe(true)
    expect(testActor.getSnapshot().context.jobOutpoints).toEqual([])
    expect(testActor.getSnapshot().context.walletScope).toBeNull()
  })

  it('WALLET_RESET from paused returns to notConfigured', async () => {
    const evaluatePolicy = vi.fn(async () => ({
      feeRateSatPerVb: 2,
      pausedReason: 'feeCapExceeded' as const,
    }))
    const { testActor } = createTestActor({ evaluatePolicy })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_AUTOMATIC',
      walletScope,
      outpoints: [leaf],
    })
    await waitFor(testActor, (state) => state.matches('paused'))

    testActor.send({ type: 'WALLET_RESET' })
    expect(testActor.getSnapshot().matches('notConfigured')).toBe(true)
  })

  it('WALLET_RESET from error returns to notConfigured', async () => {
    const fetchProgress = vi.fn(async () => {
      throw new Error('esplora unavailable')
    })
    const { testActor } = createTestActor({ fetchProgress })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(testActor, (state) => state.matches('error'))

    testActor.send({ type: 'WALLET_RESET' })
    expect(testActor.getSnapshot().matches('notConfigured')).toBe(true)
  })

  it('WALLET_RESET from complete returns to notConfigured', async () => {
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
    })
    await waitFor(testActor, (state) => state.matches('complete'))

    testActor.send({ type: 'WALLET_RESET' })
    expect(testActor.getSnapshot().matches('notConfigured')).toBe(true)
  })

  it('WALLET_RESET from waitingForParentData returns to notConfigured', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({ phase: 'idle', currentStepTxRelayed: false }),
    )
    const ensureBroadcast = vi.fn(async () => {
      throw new Error('package-not-child-with-unconfirmed-parents')
    })
    const { testActor } = createTestActor({ fetchProgress, ensureBroadcast })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(testActor, (state) => state.matches('waitingForParentData'))

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
    expect(testActor.getSnapshot().context.proceedRequested).toBe(false)
    proceedStep.mockClear()

    testActor.send({ type: 'POLL_TICK' })
    await waitFor(testActor, (state) => state.matches('idle'))
    expect(testActor.getSnapshot().context.proceedRequested).toBe(false)
    expect(proceedStep).not.toHaveBeenCalled()
  })

  it('enters waitingForParentData after package-not-child and does not auto-rebroadcast', async () => {
    const stepProgress = () =>
      progress({
        phase: 'idle',
        stepIndex: 8,
        totalSteps: 27,
        currentStepTxRelayed: false,
        nodeStatuses: Array.from({ length: 9 }, (_, i) => ({
          txid: `step${i}`,
          confirmations: i === 7 ? 5 : i < 8 ? 10 : 0,
          status: i === 8 ? 'inProgress' : 'confirmed',
        })),
      })
    const fetchProgress = vi.fn(async () => stepProgress())
    const proceedStep = vi.fn()
    let ensureCount = 0
    const ensureBroadcast = vi.fn(async () => {
      ensureCount += 1
      if (ensureCount === 1) {
        const error = Object.assign(
          new Error(
            'Previous unroll step is not confirmed on-chain yet. Wait for a confirmation, then proceed again.',
          ),
          {
            retryableUnconfirmedParent: true,
            rewoundProgress: stepProgress(),
          },
        )
        throw error
      }
      return progress({
        phase: 'waiting',
        stepIndex: 8,
        totalSteps: 27,
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
      })
    })
    const { testActor } = createTestActor({ fetchProgress, proceedStep, ensureBroadcast })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(testActor, (state) => state.matches('waitingForParentData'))
    expect(testActor.getSnapshot().context.lastErrorMessage).toBeNull()
    expect(testActor.getSnapshot().context.proceedRequested).toBe(false)
    expect(testActor.getSnapshot().matches('error')).toBe(false)
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)

    testActor.send({ type: 'POLL_TICK' })
    await waitFor(testActor, (state) => state.matches('waitingForParentData'))
    expect(ensureBroadcast).toHaveBeenCalledTimes(1)
    expect(fetchProgress.mock.calls.length).toBeGreaterThan(1)
    expect(testActor.getSnapshot().context.lastErrorMessage).toBeNull()
    expect(proceedStep).not.toHaveBeenCalled()

    testActor.send({ type: 'PROCEED_MANUAL', feeRateSatPerVb: 2 })
    await waitFor(testActor, (state) => ensureCount >= 2)
    expect(ensureBroadcast).toHaveBeenCalledTimes(2)
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
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalledWith(walletScope)
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
    testActor.send({
      type: 'ABORT_ORCHESTRATION',
      resolvedJobOutpoints: [leaf],
    })

    await waitFor(testActor, (state) => state.matches('idle'))
    expect(persistUnilateralExitFailureRecord).toHaveBeenCalledWith(
      walletScope,
      expect.objectContaining({
        reasonCode: 'user_aborted',
        vtxoIds: [],
      }),
    )
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalledWith(walletScope)
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
    testActor.send({
      type: 'ABORT_ORCHESTRATION',
      resolvedJobOutpoints: [leaf],
    })

    await waitFor(testActor, (state) => state.matches('idle'))
    expect(persistUnilateralExitFailureRecord).toHaveBeenCalledWith(
      walletScope,
      expect.objectContaining({
        reasonCode: 'user_aborted',
      }),
    )
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalledWith(walletScope)
    expect(testActor.getSnapshot().context.jobOutpoints).toEqual([])
  })

  it('aborts from idle using resolved outpoints when actor context is empty', async () => {
    const fetchProgress = vi.fn(async () => progress({ phase: 'idle' }))
    const { testActor } = createTestActor({ fetchProgress })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'ABORT_ORCHESTRATION',
      resolvedJobOutpoints: [leaf],
    })

    await waitFor(testActor, (state) => state.matches('idle'))
    expect(persistUnilateralExitFailureRecord).toHaveBeenCalledWith(
      walletScope,
      expect.objectContaining({
        reasonCode: 'user_aborted',
        selectedLeafOutpoints: [leaf],
      }),
    )
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalledWith(walletScope)
    expect(testActor.getSnapshot().context.jobOutpoints).toEqual([])
  })

  it('aborts from proceeding even when vtxo-id resolve hangs', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({ phase: 'idle', currentStepTxRelayed: true }),
    )
    const proceedStep = vi.fn(() => new Promise<ArkadeUnilateralExitProgress>(() => {}))
    const { testActor } = createTestActor({
      fetchProgress,
      proceedStep,
      resolveAbortVtxoIds: () => new Promise(() => {}),
    })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    await waitFor(testActor, (state) => state.matches('proceeding'))
    testActor.send({
      type: 'ABORT_ORCHESTRATION',
      resolvedJobOutpoints: [leaf],
    })

    await waitFor(testActor, (state) => state.matches('aborted'))
    expect(persistUnilateralExitFailureRecord).toHaveBeenCalledWith(
      walletScope,
      expect.objectContaining({ reasonCode: 'user_aborted' }),
    )
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalledWith(walletScope)
    expect(testActor.getSnapshot().matches('proceeding')).toBe(false)
  })

  it('aborts and returns to idle when vtxo-id resolve rejects', async () => {
    const fetchProgress = vi.fn(async () => progress({ phase: 'idle' }))
    const { testActor } = createTestActor({
      fetchProgress,
      resolveAbortVtxoIds: async () => {
        throw new Error('list failed')
      },
    })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'ABORT_ORCHESTRATION',
      resolvedJobOutpoints: [leaf],
    })

    await waitFor(testActor, (state) => state.matches('idle'))
    expect(persistUnilateralExitFailureRecord).toHaveBeenCalledWith(
      walletScope,
      expect.objectContaining({ reasonCode: 'user_aborted' }),
    )
    expect(clearPersistedUnilateralExitJob).toHaveBeenCalledWith(walletScope)
  })

  it('patches aborted failure vtxo ids when resolve succeeds', async () => {
    const fetchProgress = vi.fn(async () => progress({ phase: 'idle' }))
    const { testActor } = createTestActor({
      fetchProgress,
      resolveAbortVtxoIds: async () => ({ vtxoIds: ['vtxo-id-1'] }),
    })

    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'ABORT_ORCHESTRATION',
      resolvedJobOutpoints: [leaf],
    })

    await waitFor(testActor, (state) => state.matches('idle'))
    expect(persistUnilateralExitFailureRecord).toHaveBeenCalledWith(
      walletScope,
      expect.objectContaining({
        reasonCode: 'user_aborted',
        vtxoIds: ['vtxo-id-1'],
      }),
    )
  })

  it('accepts Proceed during an idle progress refresh and broadcasts after the in-flight fetch', async () => {
    let resolveFetch: ((value: ArkadeUnilateralExitProgress) => void) | undefined
    let fetchCount = 0
    const fetchProgress = vi.fn(
      () =>
        new Promise<ArkadeUnilateralExitProgress>((resolve) => {
          fetchCount += 1
          if (fetchCount === 1) {
            resolve(
              progress({
                phase: 'idle',
                stepIndex: 17,
                totalSteps: 23,
                currentStepTxRelayed: false,
              }),
            )
            return
          }
          resolveFetch = resolve
        }),
    )
    const proceedStep = vi.fn()
    let ensureCount = 0
    const ensureBroadcast = vi.fn(async () => {
      ensureCount += 1
      if (ensureCount === 1) {
        return progress({
          phase: 'idle',
          stepIndex: 17,
          totalSteps: 23,
          currentStepTxRelayed: false,
        })
      }
      return progress({
        phase: 'waiting',
        stepIndex: 17,
        totalSteps: 23,
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
      })
    })
    const { testActor } = createTestActor({ fetchProgress, proceedStep, ensureBroadcast })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(testActor, (state) => state.matches('idle'))

    testActor.send({ type: 'POLL_TICK' })
    await waitFor(testActor, (state) => state.matches('loadingProgress'))
    expect(testActor.getSnapshot().context.progressRefreshRequested).toBe(true)

    testActor.send({ type: 'PROCEED_MANUAL', feeRateSatPerVb: 2 })
    expect(testActor.getSnapshot().matches('loadingProgress')).toBe(true)
    expect(testActor.getSnapshot().context.proceedRequested).toBe(true)
    expect(testActor.getSnapshot().context.progressRefreshRequested).toBe(false)

    resolveFetch?.(
      progress({
        phase: 'idle',
        stepIndex: 17,
        totalSteps: 23,
        currentStepTxRelayed: false,
      }),
    )
    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    expect(ensureBroadcast).toHaveBeenCalledTimes(2)
    expect(proceedStep).not.toHaveBeenCalled()
  })
})
