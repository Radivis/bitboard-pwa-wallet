import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, type ReactNode } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUnilateralExitAutomationRunner } from '@/hooks/useUnilateralExitAutomationRunner'
import { useUnilateralExitAutomationStore } from '@/stores/unilateralExitAutomationStore'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore } from '@/stores/walletStore'

const getUnilateralExitProgress = vi.fn()
const estimateUnilateralExitBatch = vi.fn()
const proceedUnilateralExitStep = vi.fn()

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    getUnilateralExitProgress,
    estimateUnilateralExitBatch,
    proceedUnilateralExitStep,
  }),
}))

vi.mock('@/lib/arkade/proceed-unilateral-exit-step', () => ({
  proceedUnilateralExitStepWithGuards: (...args: unknown[]) =>
    proceedUnilateralExitStep(...args),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  getArkadeLoadLifecycleSnapshot: () => ({ loadPhase: 'loaded' }),
}))

vi.mock('@/hooks/useEsploraFeePresets', () => ({
  ESPLORA_FEE_PRESETS_QUERY_KEY: ['esplora-fee-presets'],
  presetRatesForNetwork: async () => ({ Low: 1, Medium: 2, High: 10 }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const walletId = 7
const connectionId = 'conn-test'
const leaf = { txid: 'aa'.repeat(32), vout: 0 }

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useUnilateralExitAutomationRunner', () => {
  const hookUnmounters: Array<() => void> = []

  afterEach(() => {
    for (const unmount of hookUnmounters.splice(0)) {
      unmount()
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useUnilateralExitAutomationStore.setState({ jobsByKey: {} })
    useUnilateralExitAutomationStore.persist.rehydrate = () => Promise.resolve()
    Object.defineProperty(useUnilateralExitAutomationStore.persist, 'hasHydrated', {
      configurable: true,
      value: () => true,
    })
    useFeatureStore.setState({ isArkadeEnabled: true } as Partial<
      ReturnType<typeof useFeatureStore.getState>
    >)
    useWalletStore.setState({
      activeWalletId: walletId,
      activeArkadeConnectionId: connectionId,
      networkMode: 'regtest',
      walletStatus: 'unlocked',
    } as Partial<ReturnType<typeof useWalletStore.getState>>)

    getUnilateralExitProgress.mockResolvedValue({
      phase: 'idle',
      stepIndex: 0,
      totalSteps: 2,
      nodeStatuses: [],
      leafStatuses: [],
    })
    estimateUnilateralExitBatch.mockResolvedValue({
      bumperSufficient: true,
      estimatedPackageFeeSats: 1000,
      projectedUnrollSteps: 2,
    })
    proceedUnilateralExitStep.mockResolvedValue({
      phase: 'waiting',
      stepIndex: 0,
      totalSteps: 2,
      nodeStatuses: [],
      leafStatuses: [],
    })
  })

  it('pauses when live preset exceeds max fee cap', async () => {
    useUnilateralExitAutomationStore.getState().setProceedAutomatically(
      walletId,
      'regtest',
      connectionId,
      true,
      5,
    )
    useUnilateralExitAutomationStore.getState().startJob(walletId, 'regtest', connectionId, [
      leaf,
    ], true)
    useUnilateralExitAutomationStore
      .getState()
      .setFeePresetLabel(walletId, 'regtest', connectionId, 'High')

    const { unmount } = renderHook(() => useUnilateralExitAutomationRunner(), {
      wrapper: createWrapper(),
    })
    hookUnmounters.push(unmount)

    await waitFor(() => {
      const job = useUnilateralExitAutomationStore
        .getState()
        .getJob(walletId, 'regtest', connectionId)
      expect(job.pausedReason).toBe('feeCapExceeded')
    })

    expect(proceedUnilateralExitStep).not.toHaveBeenCalled()
  })

  it('does not proceed when proceed automatically is off', async () => {
    useUnilateralExitAutomationStore.getState().startJob(
      walletId,
      'regtest',
      connectionId,
      [leaf],
      false,
    )

    const { unmount } = renderHook(() => useUnilateralExitAutomationRunner(), {
      wrapper: createWrapper(),
    })
    hookUnmounters.push(unmount)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(proceedUnilateralExitStep).not.toHaveBeenCalled()
  })

  it('calls proceed when fee is within cap and bumper is sufficient', async () => {
    let proceedCallCount = 0
    getUnilateralExitProgress.mockImplementation(async () => ({
      phase: 'idle',
      stepIndex: 0,
      totalSteps: 1,
      nodeStatuses: [],
      leafStatuses: [],
    }))
    proceedUnilateralExitStep.mockImplementation(async () => {
      proceedCallCount += 1
      return {
        phase: 'complete',
        stepIndex: 0,
        totalSteps: 1,
        nodeStatuses: [],
        leafStatuses: [],
      }
    })

    useUnilateralExitAutomationStore.getState().setProceedAutomatically(
      walletId,
      'regtest',
      connectionId,
      true,
      20,
    )
    useUnilateralExitAutomationStore.getState().startJob(walletId, 'regtest', connectionId, [
      leaf,
    ], true)

    const { unmount } = renderHook(() => useUnilateralExitAutomationRunner(), {
      wrapper: createWrapper(),
    })
    hookUnmounters.push(unmount)

    await waitFor(() => {
      expect(proceedUnilateralExitStep).toHaveBeenCalledTimes(1)
      const job = useUnilateralExitAutomationStore
        .getState()
        .getJob(walletId, 'regtest', connectionId)
      expect(job.proceedAutomatically).toBe(false)
      expect(job.jobStarted).toBe(false)
    })
  })
})
