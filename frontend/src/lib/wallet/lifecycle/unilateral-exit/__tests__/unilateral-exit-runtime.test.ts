import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetJob = vi.fn()
const mockClearJob = vi.fn()
const mockPersistJob = vi.fn()
const workerListMocks = vi.hoisted(() => ({
  listExitCandidates: vi.fn(async () => [
    { id: 'vtxo-resolved-1', txid: 'aa'.repeat(32), vout: 0, amountSats: 50_000 },
  ]),
  listUnilateralExitsInProgress: vi.fn(async () => []),
}))
let sdkHydrated = false
let sdkHydrationWaiters: Array<() => void> = []

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-frontend-sdk-persistence', () => ({
  hydrateUnilateralExitFrontendPersistenceFromSdk: vi.fn(async () => {
    if (sdkHydrated) {
      return
    }
    await new Promise<void>((resolve) => {
      sdkHydrationWaiters.push(resolve)
    })
  }),
  clearUnilateralExitFrontendMemoryForScope: vi.fn(),
  scheduleUnilateralExitJobSdkWrite: vi.fn(),
  scheduleUnilateralExitPrefsSdkWrite: vi.fn(),
  scheduleUnilateralExitFailureSdkWrite: vi.fn(),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  getArkadeLoadLifecycleSnapshot: vi.fn(() => ({
    loadPhase: 'loaded',
    networkMode: 'regtest',
    errorMessage: null,
  })),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator', () => ({
  getArkadeSyncLifecycleSnapshot: vi.fn(() => ({
    syncPhase: 'not-syncing',
    networkMode: 'regtest',
    errorMessage: null,
  })),
}))

const mockSetAutomationEnabled = vi.fn()
const mockAutomationPrefs = vi.hoisted(() => ({
  enabled: false,
  feePresetLabel: 'High' as const,
  maxFeeRateSatPerVb: 20,
}))

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence', () => ({
  useUnilateralExitAutomationPrefsStore: {
    getState: () => ({
      getPrefs: () => ({
        enabled: mockAutomationPrefs.enabled,
        feePresetLabel: mockAutomationPrefs.feePresetLabel,
        maxFeeRateSatPerVb: mockAutomationPrefs.maxFeeRateSatPerVb,
      }),
      setEnabled: mockSetAutomationEnabled,
    }),
  },
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    listExitCandidates: workerListMocks.listExitCandidates,
    listUnilateralExitsInProgress: workerListMocks.listUnilateralExitsInProgress,
  }),
}))

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence', () => ({
  getPersistedUnilateralExitJob: (...args: unknown[]) => mockGetJob(...args),
  clearPersistedUnilateralExitJob: (...args: unknown[]) => mockClearJob(...args),
  persistActiveUnilateralExitJob: (...args: unknown[]) => mockPersistJob(...args),
  ensurePersistedUnilateralExitJob: vi.fn(),
  updatePersistedUnilateralExitRelayWait: vi.fn(),
  useUnilateralExitLifecyclePersistenceStore: {
    getState: () => ({
      getJob: mockGetJob,
    }),
  },
}))

vi.mock('@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.actors', () => {
  const { fromPromise } = require('xstate')
  const progress = {
    stepIndex: 0,
    totalSteps: 2,
    phase: 'idle' as const,
    currentStepTxRelayed: false,
    nodeStatuses: [{ txid: 'step0', confirmations: 0, status: 'inProgress' as const }],
    leafStatuses: [],
  }
  return {
    invalidateUnilateralExitQueries: vi.fn(async () => {}),
    unilateralExitMachineActors: {
      fetchProgressActor: fromPromise(async () => progress),
      evaluateJobViabilityActor: fromPromise(async () => ({
        status: 'ok' as const,
        reasonCode: 'ok',
        offendingOutpoints: [],
      })),
      proceedStepActor: fromPromise(async () => progress),
      evaluateAutomationPolicyActor: fromPromise(async () => ({
        feeRateSatPerVb: 2,
        pausedReason: null,
      })),
      ensureBroadcastActor: fromPromise(async () => ({
        ...progress,
        phase: 'waiting' as const,
        currentStepTxRelayed: true,
        currentStepWaitingSince: 1_700_000_000,
      })),
      resolveAbortVtxoIdsActor: fromPromise(async () => ({ vtxoIds: [] as string[] })),
    },
  }
})

import { getArkadeSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import {
  configureUnilateralExitForLoadedWallet,
  abortUnilateralExitOrchestration,
  hydrateUnilateralExitFromPersistence,
  resetUnilateralExitActorForTests,
  sendUnilateralExitEvent,
  getUnilateralExitActorSnapshot,
  syncUnilateralExitWithLockPhase,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'
import {
  consumePendingBatchIntentCancelled,
  markPendingBatchIntentCancelled,
  pendingBatchIntentKey,
} from '@/lib/arkade/arkade-pending-batch-intent'
import { UNILATERAL_EXIT_MACHINE_STATE } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import { unilateralExitSnapshotIsInState } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-snapshot'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  connectionId: 'conn-1',
}

const leaf = { txid: 'aa'.repeat(32), vout: 0 }

describe('unilateral-exit-runtime hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sdkHydrated = false
    sdkHydrationWaiters = []
    mockAutomationPrefs.enabled = false
    resetUnilateralExitActorForTests()
    mockGetJob.mockReturnValue({
      selectedLeafOutpoints: [leaf],
      currentStepRelayedSinceUnix: null,
      jobStartedAtUnix: 1_700_000_000,
    })
    vi.mocked(getArkadeSyncLifecycleSnapshot).mockReturnValue({
      syncPhase: 'not-syncing',
      networkMode: 'regtest',
      errorMessage: null,
    })
  })

  it('hydrate waits for SDK frontend persistence before reading job', async () => {
    const hydratePromise = hydrateUnilateralExitFromPersistence({
      walletScope,
      inProgressOutpoints: [leaf],
      unilateralExitInProgressSats: 50_000,
    })

    await Promise.resolve()
    expect(mockGetJob).not.toHaveBeenCalled()

    sdkHydrated = true
    for (const resolve of sdkHydrationWaiters) {
      resolve()
    }
    await hydratePromise

    expect(mockGetJob).toHaveBeenCalled()
  })

  it('hydrate does not clear job while arkade sync still settling', async () => {
    sdkHydrated = true
    vi.mocked(getArkadeSyncLifecycleSnapshot).mockReturnValue({
      syncPhase: 'syncing',
      networkMode: 'regtest',
      errorMessage: null,
    })

    await hydrateUnilateralExitFromPersistence({
      walletScope,
      inProgressOutpoints: [],
      unilateralExitInProgressSats: 0,
    })

    expect(mockClearJob).not.toHaveBeenCalled()
  })

  it('restore then hydrate still enters checkingProgress', async () => {
    sdkHydrated = true

    await configureUnilateralExitForLoadedWallet(walletScope)

    sendUnilateralExitEvent({
      type: 'HYDRATE_OR_START',
      walletScope,
      outpoints: [leaf],
      automationEnabled: false,
      resumeAutomation: false,
      reconcileInProgressSats: 50_000,
      reconcileInProgressOutpoints: [leaf],
    })

    await new Promise((resolve) => setTimeout(resolve, 50))

    let snapshot = getUnilateralExitActorSnapshot()
    expect(snapshot.context.jobOutpoints).toEqual([leaf])

    await hydrateUnilateralExitFromPersistence({
      walletScope,
      inProgressOutpoints: [leaf],
      unilateralExitInProgressSats: 50_000,
    })

    snapshot = getUnilateralExitActorSnapshot()
    expect(snapshot.context.jobOutpoints).toEqual([leaf])
    expect(
      unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm) ||
        unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.idle),
    ).toBe(true)
  })

  it('hydrate resumes a pre-broadcast persisted job instead of clearing it', async () => {
    sdkHydrated = true
    mockGetJob.mockReturnValue({
      selectedLeafOutpoints: [leaf],
      currentStepRelayedSinceUnix: null,
      jobStartedAtUnix: 1_700_000_000,
    })

    await configureUnilateralExitForLoadedWallet(walletScope)
    await hydrateUnilateralExitFromPersistence({
      walletScope,
      inProgressOutpoints: [],
      unilateralExitInProgressSats: 0,
    })

    expect(mockClearJob).not.toHaveBeenCalled()
    const snapshot = getUnilateralExitActorSnapshot()
    expect(snapshot.context.jobOutpoints).toEqual([leaf])
  })

  it('does not clear persisted job when in-progress sats exist before outpoints load', async () => {
    sdkHydrated = true

    await hydrateUnilateralExitFromPersistence({
      walletScope,
      inProgressOutpoints: [],
      unilateralExitInProgressSats: 300_000,
    })

    expect(mockClearJob).not.toHaveBeenCalled()
  })

  it('does not clear persisted job when in-progress outpoints do not overlap selection', async () => {
    sdkHydrated = true
    const intermediate = { txid: 'bb'.repeat(32), vout: 0 }

    await hydrateUnilateralExitFromPersistence({
      walletScope,
      inProgressOutpoints: [intermediate],
      unilateralExitInProgressSats: 300_000,
    })

    expect(mockClearJob).not.toHaveBeenCalled()
  })

  it('hydrate does not resume from in-progress outpoints when persisted job is empty', async () => {
    sdkHydrated = true
    mockGetJob.mockReturnValue({
      selectedLeafOutpoints: [],
      currentStepRelayedSinceUnix: null,
      jobStartedAtUnix: null,
    })

    await configureUnilateralExitForLoadedWallet(walletScope)
    await hydrateUnilateralExitFromPersistence({
      walletScope,
      inProgressOutpoints: [leaf],
      unilateralExitInProgressSats: 50_000,
    })

    const snapshot = getUnilateralExitActorSnapshot()
    expect(snapshot.context.jobOutpoints).toEqual([])
    expect(mockPersistJob).not.toHaveBeenCalled()
  })

  it('lock phase locked resets a waitingConfirm actor', async () => {
    sdkHydrated = true
    mockGetJob.mockReturnValue({
      selectedLeafOutpoints: [leaf],
      currentStepRelayedSinceUnix: null,
      jobStartedAtUnix: 1_700_000_000,
    })

    await configureUnilateralExitForLoadedWallet(walletScope)
    sendUnilateralExitEvent({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const beforeLock = getUnilateralExitActorSnapshot()
    expect(beforeLock.value).toBe(UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm)

    syncUnilateralExitWithLockPhase('locked')

    const afterLock = getUnilateralExitActorSnapshot()
    expect(afterLock.value).toBe(UNILATERAL_EXIT_MACHINE_STATE.notConfigured)
    expect(afterLock.context.walletScope).toBeNull()
  })

  it('abort orchestration disables automation and clears job', async () => {
    sdkHydrated = true
    mockSetAutomationEnabled.mockClear()

    await configureUnilateralExitForLoadedWallet(walletScope)
    sendUnilateralExitEvent({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    await abortUnilateralExitOrchestration(walletScope, [leaf])

    expect(mockSetAutomationEnabled).toHaveBeenCalledWith(walletScope, false)
    const snapshot = getUnilateralExitActorSnapshot()
    expect(snapshot.context.jobOutpoints).toEqual([])
    expect(unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.idle)).toBe(true)
  })

  it('abort orchestration does not await worker list RPCs', async () => {
    sdkHydrated = true
    workerListMocks.listExitCandidates.mockImplementation(() => new Promise(() => {}))
    workerListMocks.listUnilateralExitsInProgress.mockImplementation(
      () => new Promise(() => {}),
    )

    await configureUnilateralExitForLoadedWallet(walletScope)
    sendUnilateralExitEvent({
      type: 'START_MANUAL',
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    await abortUnilateralExitOrchestration(walletScope, [leaf])

    expect(workerListMocks.listExitCandidates).not.toHaveBeenCalled()
    expect(workerListMocks.listUnilateralExitsInProgress).not.toHaveBeenCalled()
    expect(mockSetAutomationEnabled).toHaveBeenCalledWith(walletScope, false)
    const snapshot = getUnilateralExitActorSnapshot()
    expect(
      unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.idle) ||
        unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.aborted),
    ).toBe(true)
  })

  it('configure_syncs_automation_prefs_into_machine', async () => {
    sdkHydrated = true
    mockAutomationPrefs.enabled = true

    await configureUnilateralExitForLoadedWallet(walletScope)

    expect(getUnilateralExitActorSnapshot().context.automationEnabled).toBe(true)
  })

  it('lock_reset_clears_pending_intent_session_tracking', () => {
    const intent = {
      kind: 'recover',
      amountSats: 1,
      registeredAt: 1,
      onchainOutpoints: [],
      vtxoOutpoints: [{ txid: 'aa', vout: 0 }],
    }
    markPendingBatchIntentCancelled(intent)
    syncUnilateralExitWithLockPhase('locked')
    expect(consumePendingBatchIntentCancelled(pendingBatchIntentKey(intent))).toBe(false)
  })
})
