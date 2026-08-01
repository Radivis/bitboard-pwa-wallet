import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estimateUnilateralExitBatch = vi.fn()
const getUnilateralExitProgress = vi.fn()
const orchestrateUnilateralExitProceedStep = vi.hoisted(() => vi.fn())
const orchestrateUnilateralExitRefreshProgress = vi.hoisted(() => vi.fn())
const lifecycleSnapshotRef = vi.hoisted(() => ({
  phase: 'waiting-confirm' as string,
  selectedLeafOutpoints: [{ txid: 'aa'.repeat(32), vout: 0 }],
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    estimateUnilateralExitBatch,
    getUnilateralExitProgress,
  }),
}))

vi.mock('@/lib/wallet/lifecycle/unilateral-exit-lifecycle-orchestrator', () => ({
  getUnilateralExitLifecycleSnapshot: () => ({
    phase: lifecycleSnapshotRef.phase,
    walletScope: {
      walletId: 1,
      networkMode: 'regtest',
      connectionId: 'conn-1',
    },
    selectedLeafOutpoints: lifecycleSnapshotRef.selectedLeafOutpoints,
    progress: null,
    lastErrorMessage: null,
  }),
  orchestrateUnilateralExitProceedStep,
  orchestrateUnilateralExitRefreshProgress,
  subscribeUnilateralExitLifecycle: () => () => {},
}))

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  getArkadeLoadLifecycleSnapshot: () => ({
    loadPhase: 'loaded',
    networkMode: 'regtest',
    errorMessage: null,
  }),
}))

vi.mock('@/lib/arkade/arkade-endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/arkade/arkade-endpoints')>()
  return {
    ...actual,
    isArkadeSupportedNetworkMode: () => true,
  }
})

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

vi.mock('@/hooks/useEsploraFeePresets', () => ({
  ESPLORA_FEE_PRESETS_QUERY_KEY: ['esplora-fee-presets'],
  presetRatesForNetwork: () => ({ Low: 1, Medium: 2, High: 4 }),
}))

vi.mock('@/lib/shared/app-query-client', () => ({
  appQueryClient: {
    fetchQuery: vi.fn().mockResolvedValue({ Low: 1, Medium: 2, High: 4 }),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

import {
  disableAutomaticUnilateralExit,
  enableAutomaticUnilateralExit,
  getUnilateralExitAutomationSnapshot,
  resetUnilateralExitAutomationStateForTests,
  scheduleAutomaticAdvance,
} from '@/lib/wallet/lifecycle/unilateral-exit-automation-controller'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  connectionId: 'conn-1',
}

describe('unilateral-exit-automation-controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetUnilateralExitAutomationStateForTests()
    useUnilateralExitAutomationPrefsStore.setState({ prefsByKey: {} })
    vi.clearAllMocks()
    lifecycleSnapshotRef.phase = 'waiting-confirm'
    lifecycleSnapshotRef.selectedLeafOutpoints = [{ txid: 'aa'.repeat(32), vout: 0 }]
    estimateUnilateralExitBatch.mockResolvedValue({
      bumperSufficient: true,
      projectedUnrollSteps: 3,
      estimatedPackageFeeSats: 300,
    })
    getUnilateralExitProgress.mockResolvedValue({
      phase: 'waiting',
      stepIndex: 0,
      totalSteps: 3,
      nodeStatuses: [],
      leafStatuses: [],
    })
    orchestrateUnilateralExitProceedStep.mockResolvedValue(undefined)
    orchestrateUnilateralExitRefreshProgress.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not schedule when automation is disabled', () => {
    scheduleAutomaticAdvance()
    vi.runAllTimers()
    expect(orchestrateUnilateralExitProceedStep).not.toHaveBeenCalled()
    expect(getUnilateralExitAutomationSnapshot().scheduling).toBe('idle')
  })

  it('schedules proceed when enabled and lifecycle job is active', async () => {
    enableAutomaticUnilateralExit(walletScope, 10)
    expect(getUnilateralExitAutomationSnapshot().scheduling).toBe('scheduled')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(estimateUnilateralExitBatch).toHaveBeenCalled()
    expect(orchestrateUnilateralExitProceedStep).toHaveBeenCalledWith({ feeRateSatPerVb: 2 })
  })

  it('pauses when fee cap is exceeded', async () => {
    useUnilateralExitAutomationPrefsStore.getState().setEnabled(walletScope, true)
    useUnilateralExitAutomationPrefsStore.getState().setMaxFeeRateSatPerVb(walletScope, 1)

    scheduleAutomaticAdvance()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(getUnilateralExitAutomationSnapshot().pausedReason).toBe('feeCapExceeded')
    expect(orchestrateUnilateralExitProceedStep).not.toHaveBeenCalled()
  })

  it('pauses when bumper balance is insufficient', async () => {
    estimateUnilateralExitBatch.mockResolvedValue({
      bumperSufficient: false,
      projectedUnrollSteps: 3,
      estimatedPackageFeeSats: 300,
    })

    enableAutomaticUnilateralExit(walletScope, 10)
    await vi.advanceTimersByTimeAsync(2_000)

    expect(getUnilateralExitAutomationSnapshot().pausedReason).toBe('bumperInsufficient')
    expect(orchestrateUnilateralExitProceedStep).not.toHaveBeenCalled()
  })

  it('stops scheduling when automation is disabled', async () => {
    enableAutomaticUnilateralExit(walletScope, 10)
    disableAutomaticUnilateralExit(walletScope)
    await vi.advanceTimersByTimeAsync(2_000)

    expect(getUnilateralExitAutomationSnapshot().pausedReason).toBe('userDisabled')
    expect(orchestrateUnilateralExitProceedStep).not.toHaveBeenCalled()
  })

  it('does not schedule when lifecycle is complete', () => {
    lifecycleSnapshotRef.phase = 'complete'
    enableAutomaticUnilateralExit(walletScope, 10)
    vi.runAllTimers()
    expect(orchestrateUnilateralExitProceedStep).not.toHaveBeenCalled()
    expect(getUnilateralExitAutomationSnapshot().scheduling).toBe('idle')
  })
})
