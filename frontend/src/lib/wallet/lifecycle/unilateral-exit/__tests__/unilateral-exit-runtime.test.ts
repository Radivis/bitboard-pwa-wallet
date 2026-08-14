import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetJob = vi.fn()
const mockClearJob = vi.fn()
let persistenceHydrated = false
let persistenceHydrationWaiters: Array<() => void> = []

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/settings/persisted-store-hydration', () => ({
  waitForPersistedStoreHydration: vi.fn(async () => {
    if (persistenceHydrated) {
      return
    }
    await new Promise<void>((resolve) => {
      persistenceHydrationWaiters.push(resolve)
    })
  }),
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

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence', () => ({
  useUnilateralExitAutomationPrefsStore: {
    getState: () => ({
      getPrefs: () => ({
        enabled: false,
        feePresetLabel: 'High',
        maxFeeRateSatPerVb: 20,
      }),
      setEnabled: mockSetAutomationEnabled,
    }),
  },
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    listExitCandidates: vi.fn(async () => [
      { id: 'vtxo-resolved-1', txid: leaf.txid, vout: leaf.vout, amountSats: 50_000 },
    ]),
    listUnilateralExitsInProgress: vi.fn(async () => []),
  }),
}))

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence', () => ({
  getPersistedUnilateralExitJob: (...args: unknown[]) => mockGetJob(...args),
  clearPersistedUnilateralExitJob: (...args: unknown[]) => mockClearJob(...args),
  persistActiveUnilateralExitJob: vi.fn(),
  updatePersistedUnilateralExitRelayWait: vi.fn(),
  useUnilateralExitLifecyclePersistenceStore: {
    persist: {
      hasHydrated: () => persistenceHydrated,
      onFinishHydration: () => () => {},
    },
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
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'
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
    persistenceHydrated = false
    persistenceHydrationWaiters = []
    resetUnilateralExitActorForTests()
    mockGetJob.mockReturnValue({
      jobActive: true,
      selectedLeafOutpoints: [leaf],
      currentStepRelayedSinceUnix: null,
    })
    vi.mocked(getArkadeSyncLifecycleSnapshot).mockReturnValue({
      syncPhase: 'not-syncing',
      networkMode: 'regtest',
      errorMessage: null,
    })
  })

  it('hydrate waits for lifecycle persistence store before reading job', async () => {
    const hydratePromise = hydrateUnilateralExitFromPersistence({
      walletScope,
      inProgressOutpoints: [leaf],
      unilateralExitInProgressSats: 50_000,
    })

    await Promise.resolve()
    expect(mockGetJob).not.toHaveBeenCalled()

    persistenceHydrated = true
    for (const resolve of persistenceHydrationWaiters) {
      resolve()
    }
    await hydratePromise

    expect(mockGetJob).toHaveBeenCalled()
  })

  it('hydrate does not clear job while arkade sync still settling', async () => {
    persistenceHydrated = true
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
    persistenceHydrated = true

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

  it('stale hydrate clears persisted bookmark without CLEAR_JOB event', async () => {
    persistenceHydrated = true
    mockGetJob.mockReturnValue({
      jobActive: true,
      selectedLeafOutpoints: [leaf],
      currentStepRelayedSinceUnix: null,
    })

    await hydrateUnilateralExitFromPersistence({
      walletScope,
      inProgressOutpoints: [],
      unilateralExitInProgressSats: 0,
    })

    expect(mockClearJob).toHaveBeenCalled()
    const snapshot = getUnilateralExitActorSnapshot()
    expect(snapshot.context.jobOutpoints).toEqual([])
  })

  it('abort orchestration disables automation and clears job', async () => {
    persistenceHydrated = true
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
})
