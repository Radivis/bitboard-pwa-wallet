import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence', () => ({
  persistActiveUnilateralExitJob: vi.fn(),
  ensurePersistedUnilateralExitJob: vi.fn(),
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
  ArkadeVtxoExitRecordDto,
} from '@/workers/arkade-api'
import { unilateralExitMachine } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine'
import {
  isVtxoExitChildId,
  vtxoExitChildId,
} from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-machine-types'
import { shouldLockUnilateralExitLeafSelection } from '@/lib/arkade/unilateral-exit-job-reconcile'
import { selectIsUnilateralExitJobActive } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-selectors'
import { toUnilateralExitActorSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-snapshot'
import { getPersistedUnilateralExitJob } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  arkadeAccountId: 'conn-1',
}

const leftoverLeaf = { txid: 'aa'.repeat(32), vout: 0 }
const secondLeaf = { txid: 'cc'.repeat(32), vout: 0 }

function progress(
  overrides: Partial<ArkadeUnilateralExitProgress> = {},
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

function record(
  outpoint: { txid: string; vout: number },
  phase: ArkadeVtxoExitRecordDto['phase'],
): ArkadeVtxoExitRecordDto {
  return {
    txid: outpoint.txid,
    vout: outpoint.vout,
    amountSats: 50_000,
    phase,
    hostTxid: outpoint.txid,
    taggedAt: 1_700_000_000,
  }
}

const startedTestActors: Array<ReturnType<typeof createActor>> = []

function createTestActor(params: {
  fetchProgress?: () => Promise<ArkadeUnilateralExitProgress>
  evaluateJobViability?: () => Promise<ArkadeUnilateralExitJobViability>
} = {}) {
  const fetchProgress =
    params.fetchProgress ?? vi.fn(async () => progress({ phase: 'idle' }))
  const evaluateJobViability =
    params.evaluateJobViability ??
    vi.fn(async () => ({
      status: 'ok' as const,
      reasonCode: 'ok',
      offendingOutpoints: [],
    }))
  const testActor = createActor(
    unilateralExitMachine.provide({
      actors: {
        fetchProgressActor: fromPromise(fetchProgress),
        evaluateJobViabilityActor: fromPromise(evaluateJobViability),
        proceedStepActor: fromPromise(async () => progress({ phase: 'waiting' })),
        ensureBroadcastActor: fromPromise(async () =>
          progress({
            phase: 'waiting',
            currentStepTxRelayed: true,
            currentStepWaitingSince: 1_700_000_000,
          }),
        ),
        evaluateAutomationPolicyActor: fromPromise(async () => ({
          feeRateSatPerVb: 2,
          pausedReason: null,
        })),
        resolveAbortVtxoIdsActor: fromPromise(async () => ({ vtxoIds: [] as string[] })),
        tagPlanActor: fromPromise(async () => {}),
      },
    }),
    { input: { pollDelayMs: 60_000, parentDataWaitMs: 60_000 } },
  )
  testActor.start()
  startedTestActors.push(testActor)
  return { testActor, fetchProgress }
}

function vtxoChildIds(actor: ReturnType<typeof createActor>): string[] {
  return Object.keys(actor.getSnapshot().children).filter(isVtxoExitChildId)
}

function vtxoChildValue(
  actor: ReturnType<typeof createActor>,
  outpoint: { txid: string; vout: number },
): string | undefined {
  const child = actor.getSnapshot().children[vtxoExitChildId(outpoint.txid, outpoint.vout)]
  if (child == null || !('getSnapshot' in child)) {
    return undefined
  }
  const value = child.getSnapshot().value
  return typeof value === 'string' ? value : undefined
}

describe('unilateralExitMachine VTXO children', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPersistedUnilateralExitJob).mockReturnValue({
      selectedLeafOutpoints: [],
      currentStepRelayedSinceUnix: null,
      jobStartedAtUnix: 1_700_000_000,
    })
  })

  afterEach(() => {
    for (const actor of startedTestActors) {
      actor.stop()
    }
    startedTestActors.length = 0
  })

  it('spawn_from_records_with_empty_job_bookmark', () => {
    const { testActor } = createTestActor()
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'HYDRATE_VTXO_RECORDS',
      records: [record(leftoverLeaf, 'unrolled')],
    })

    expect(testActor.getSnapshot().context.jobOutpoints).toEqual([])
    expect(vtxoChildValue(testActor, leftoverLeaf)).toBe('unrolled')
  })

  it('abort_does_not_stop_host_broadcast_attempted_children', async () => {
    const { testActor } = createTestActor()
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leftoverLeaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(testActor, (state) => state.matches('waitingConfirm'))

    testActor.send({
      type: 'HYDRATE_VTXO_RECORDS',
      records: [
        record(leftoverLeaf, 'host_broadcast_attempted'),
        record(secondLeaf, 'tagged'),
      ],
    })
    testActor.send({
      type: 'ABORT_ORCHESTRATION',
      resolvedJobOutpoints: [leftoverLeaf],
    })
    await waitFor(testActor, (state) => state.matches('idle'))

    testActor.send({
      type: 'HYDRATE_VTXO_RECORDS',
      records: [record(leftoverLeaf, 'host_broadcast_attempted')],
    })

    expect(vtxoChildValue(testActor, leftoverLeaf)).toBe('host_broadcast_attempted')
    expect(vtxoChildIds(testActor)).not.toContain(vtxoExitChildId(secondLeaf.txid, secondLeaf.vout))
  })

  it('terminate_does_not_stop_leftover_pipeline_children', async () => {
    const evaluateJobViability = vi.fn(async () => ({
      status: 'branchFundingLost' as const,
      reasonCode: 'branch_funding_lost',
      offendingOutpoints: [leftoverLeaf],
    }))
    const { testActor } = createTestActor({ evaluateJobViability })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'HYDRATE_VTXO_RECORDS',
      records: [record(leftoverLeaf, 'unrolled'), record(secondLeaf, 'tagged')],
    })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [secondLeaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(testActor, (state) => state.matches('idle'))

    testActor.send({
      type: 'HYDRATE_VTXO_RECORDS',
      records: [record(leftoverLeaf, 'unrolled'), record(secondLeaf, 'funding_lost')],
    })

    expect(vtxoChildValue(testActor, leftoverLeaf)).toBe('unrolled')
    expect(vtxoChildValue(testActor, secondLeaf)).toBe('funding_lost')
  })

  it('clear_job_does_not_stop_leftover_pipeline_children', () => {
    const { testActor } = createTestActor()
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'HYDRATE_VTXO_RECORDS',
      records: [record(leftoverLeaf, 'unrolled')],
    })
    testActor.send({ type: 'CLEAR_JOB' })
    expect(vtxoChildValue(testActor, leftoverLeaf)).toBe('unrolled')
  })

  it('arkade_session_reset_stops_all_vtxo_children', () => {
    const { testActor } = createTestActor()
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'HYDRATE_VTXO_RECORDS',
      records: [record(leftoverLeaf, 'unrolled')],
    })
    expect(vtxoChildIds(testActor).length).toBe(1)

    testActor.send({ type: 'ARKADE_SESSION_RESET' })
    expect(vtxoChildIds(testActor)).toEqual([])
    expect(testActor.getSnapshot().matches('notConfigured')).toBe(true)
  })

  it('branch_complete_releases_to_idle_with_empty_bookmark', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'complete',
        stepIndex: 2,
        totalSteps: 2,
        currentStepTxRelayed: true,
        leafStatuses: [
          {
            txid: leftoverLeaf.txid,
            vout: leftoverLeaf.vout,
            confirmations: 6,
            isUnrolled: true,
          },
        ],
      }),
    )
    const { testActor } = createTestActor({ fetchProgress })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'HYDRATE_VTXO_RECORDS',
      records: [record(leftoverLeaf, 'unrolled')],
    })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leftoverLeaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(
      testActor,
      (state) => state.matches('idle') && state.context.jobOutpoints.length === 0,
    )

    expect(vtxoChildValue(testActor, leftoverLeaf)).toBe('unrolled')
    expect(
      selectIsUnilateralExitJobActive(toUnilateralExitActorSnapshot(testActor.getSnapshot())),
    ).toBe(false)
  })

  it('start_second_job_keeps_leftover_unrolled_children', async () => {
    const { testActor } = createTestActor()
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'HYDRATE_VTXO_RECORDS',
      records: [record(leftoverLeaf, 'unrolled')],
    })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [secondLeaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(testActor, (state) => state.matches('waitingConfirm'))
    testActor.send({
      type: 'HYDRATE_VTXO_RECORDS',
      records: [record(leftoverLeaf, 'unrolled'), record(secondLeaf, 'tagged')],
    })

    expect(vtxoChildValue(testActor, leftoverLeaf)).toBe('unrolled')
    expect(vtxoChildValue(testActor, secondLeaf)).toBe('tagged')
    expect(testActor.getSnapshot().context.jobOutpoints).toEqual([secondLeaf])
  })

  it('selection_unlocked_after_branch_complete', async () => {
    const fetchProgress = vi.fn(async () =>
      progress({
        phase: 'complete',
        stepIndex: 2,
        totalSteps: 2,
        currentStepTxRelayed: true,
        leafStatuses: [
          {
            txid: leftoverLeaf.txid,
            vout: leftoverLeaf.vout,
            confirmations: 6,
            isUnrolled: true,
          },
        ],
      }),
    )
    const { testActor } = createTestActor({ fetchProgress })
    testActor.send({ type: 'WALLET_CONFIGURED', walletScope })
    testActor.send({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leftoverLeaf],
      feeRateSatPerVb: 2,
    })
    await waitFor(
      testActor,
      (state) => state.matches('idle') && state.context.jobOutpoints.length === 0,
    )

    const snapshot = toUnilateralExitActorSnapshot(testActor.getSnapshot())
    expect(
      shouldLockUnilateralExitLeafSelection({
        lifecycleJobActive: selectIsUnilateralExitJobActive(snapshot),
        persistedJobExists: false,
      }),
    ).toBe(false)
  })
})
