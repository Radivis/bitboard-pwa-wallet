import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUnilateralExitProgress = vi.fn()
const proceedUnilateralExitStep = vi.fn()
const loadPhaseRef = vi.hoisted(() => ({ phase: 'loaded' as string }))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    getUnilateralExitProgress,
    proceedUnilateralExitStep,
  }),
}))

vi.mock('@/lib/arkade/arkade-utils', () => ({
  isArkadeActiveForNetworkMode: () => true,
}))

vi.mock('@/lib/arkade/arkade-endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/arkade/arkade-endpoints')>()
  return {
    ...actual,
    isArkadeSupportedNetworkMode: () => true,
  }
})

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  getArkadeLoadLifecycleSnapshot: () => ({
    loadPhase: loadPhaseRef.phase,
    networkMode: 'regtest',
    errorMessage: null,
  }),
  awaitArkadeLoadQuiescence: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/walletStore', () => ({
  getCommittedNetworkMode: () => 'regtest',
  useWalletStore: {
    getState: () => ({
      activeWalletId: 1,
      activeArkadeConnectionId: 'conn-1',
      walletStatus: 'unlocked',
      networkMode: 'regtest',
    }),
  },
}))

vi.mock('@/lib/shared/app-query-client', () => ({
  appQueryClient: {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  },
}))

import {
  configureUnilateralExitLifecycleForLoadedWallet,
  getUnilateralExitLifecycleSnapshot,
  orchestrateUnilateralExitClearJob,
  orchestrateUnilateralExitProceedStep,
  orchestrateUnilateralExitRefreshProgress,
  orchestrateUnilateralExitStart,
  resetUnilateralExitLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-orchestrator'
import { useUnilateralExitLifecyclePersistenceStore } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  connectionId: 'conn-1',
}

const leaf = { txid: 'aa'.repeat(32), vout: 0 }

describe('unilateral-exit-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetUnilateralExitLifecycleStateForTests()
    useUnilateralExitLifecyclePersistenceStore.setState({ jobsByKey: {} })
    vi.clearAllMocks()
    loadPhaseRef.phase = 'loaded'
    getUnilateralExitProgress.mockResolvedValue({
      phase: 'idle',
      stepIndex: 0,
      totalSteps: 2,
      nodeStatuses: [{ txid: 'step0', confirmations: 0, status: 'inProgress' }],
      leafStatuses: [],
    })
    proceedUnilateralExitStep.mockResolvedValue({
      phase: 'waiting',
      stepIndex: 0,
      totalSteps: 2,
      currentStepWaitingSince: 1_700_000_000,
      nodeStatuses: [{ txid: 'step0', confirmations: 0, status: 'inProgress' }],
      leafStatuses: [],
    })
    configureUnilateralExitLifecycleForLoadedWallet(walletScope)
  })

  it('starts job and proceeds first step', async () => {
    getUnilateralExitProgress
      .mockResolvedValueOnce({
        phase: 'idle',
        stepIndex: 0,
        totalSteps: 2,
        nodeStatuses: [{ txid: 'step0', confirmations: 0, status: 'inProgress' }],
        leafStatuses: [],
      })
      .mockResolvedValueOnce({
        phase: 'waiting',
        stepIndex: 0,
        totalSteps: 2,
        currentStepWaitingSince: 1_700_000_000,
        nodeStatuses: [{ txid: 'step0', confirmations: 0, status: 'inProgress' }],
        leafStatuses: [],
      })

    await orchestrateUnilateralExitStart({
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    expect(proceedUnilateralExitStep).toHaveBeenCalledTimes(1)
    const snap = getUnilateralExitLifecycleSnapshot()
    expect(snap.phase).toBe('waiting-confirm')
    expect(snap.selectedLeafOutpoints).toEqual([leaf])
  })

  it('coalesces concurrent proceed calls', async () => {
    await orchestrateUnilateralExitStart({
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    vi.clearAllMocks()
    getUnilateralExitProgress.mockResolvedValue({
      phase: 'idle',
      stepIndex: 1,
      totalSteps: 2,
      nodeStatuses: [
        { txid: 'step0', confirmations: 1, status: 'confirmed' },
        { txid: 'step1', confirmations: 0, status: 'inProgress' },
      ],
      leafStatuses: [],
    })
    proceedUnilateralExitStep.mockResolvedValue({
      phase: 'waiting',
      stepIndex: 1,
      totalSteps: 2,
      currentStepWaitingSince: 1_700_000_100,
      nodeStatuses: [
        { txid: 'step0', confirmations: 1, status: 'confirmed' },
        { txid: 'step1', confirmations: 0, status: 'inProgress' },
      ],
      leafStatuses: [],
    })

    await Promise.all([
      orchestrateUnilateralExitProceedStep({ feeRateSatPerVb: 2 }),
      orchestrateUnilateralExitProceedStep({ feeRateSatPerVb: 2 }),
    ])

    expect(proceedUnilateralExitStep).toHaveBeenCalledTimes(1)
  })

  it('marks branch complete when all nodes confirmed', async () => {
    getUnilateralExitProgress.mockResolvedValue({
      phase: 'complete',
      stepIndex: 2,
      totalSteps: 2,
      nodeStatuses: [
        { txid: 'step0', confirmations: 1, status: 'confirmed' },
        { txid: 'step1', confirmations: 1, status: 'confirmed' },
      ],
      leafStatuses: [],
    })

    await orchestrateUnilateralExitStart({
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })

    expect(getUnilateralExitLifecycleSnapshot().phase).toBe('complete')
    expect(proceedUnilateralExitStep).not.toHaveBeenCalled()
    const persisted = useUnilateralExitLifecyclePersistenceStore
      .getState()
      .getJob(1, 'regtest', 'conn-1')
    expect(persisted.jobActive).toBe(false)
  })

  it('clearJob resets persisted job without implying on-chain abort', async () => {
    await orchestrateUnilateralExitStart({
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    orchestrateUnilateralExitClearJob()
    const persisted = useUnilateralExitLifecyclePersistenceStore
      .getState()
      .getJob(1, 'regtest', 'conn-1')
    expect(persisted.jobActive).toBe(false)
    expect(getUnilateralExitLifecycleSnapshot().phase).toBe('idle')
  })

  it('refreshProgress updates snapshot when waiting step confirms', async () => {
    await orchestrateUnilateralExitStart({
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    getUnilateralExitProgress.mockResolvedValue({
      phase: 'idle',
      stepIndex: 1,
      totalSteps: 2,
      nodeStatuses: [
        { txid: 'step0', confirmations: 1, status: 'confirmed' },
        { txid: 'step1', confirmations: 1, status: 'confirmed' },
      ],
      leafStatuses: [],
    })

    await orchestrateUnilateralExitRefreshProgress()

    const snap = getUnilateralExitLifecycleSnapshot()
    expect(snap.progress?.stepIndex).toBe(1)
    expect(snap.phase).not.toBe('waiting-confirm')
  })

  it('clears persisted job when refresh detects branch complete', async () => {
    await orchestrateUnilateralExitStart({
      walletScope,
      outpoints: [leaf],
      feeRateSatPerVb: 2,
    })
    getUnilateralExitProgress.mockResolvedValue({
      phase: 'complete',
      stepIndex: 2,
      totalSteps: 2,
      nodeStatuses: [
        { txid: 'step0', confirmations: 1, status: 'confirmed' },
        { txid: 'step1', confirmations: 1, status: 'confirmed' },
      ],
      leafStatuses: [],
    })

    await orchestrateUnilateralExitRefreshProgress()

    expect(getUnilateralExitLifecycleSnapshot().phase).toBe('complete')
    const persisted = useUnilateralExitLifecyclePersistenceStore
      .getState()
      .getJob(1, 'regtest', 'conn-1')
    expect(persisted.jobActive).toBe(false)
  })
})
