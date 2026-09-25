import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadePanel } from '@/components/wallet/ArkadePanel'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  }
})

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ isArkadeEnabled: true, isMainnetAccessEnabled: false }),
    { getState: () => ({ isArkadeEnabled: true, isMainnetAccessEnabled: false }) },
  ),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  const state = {
    ...actual.useWalletStore.getState(),
    networkMode: 'signet' as const,
    activeWalletId: 1,
    committedNetworkMode: 'signet' as const,
  }
  return {
    ...actual,
    useWalletStore: Object.assign(
      (selector: (walletState: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  }
})

const arkadeLoadSnapshot = vi.hoisted(() => ({
  loadPhase: 'loaded' as 'loaded' | 'loading' | 'load-error' | 'not-configured',
  networkMode: 'signet' as const,
  errorMessage: null as string | null,
}))

vi.mock('@/hooks/useArkadeLifecycleSnapshots', () => ({
  useArkadeLoadLifecycleSnapshot: () => arkadeLoadSnapshot,
  useArkadeSyncLifecycleSnapshot: () => ({
    syncPhase: 'not-syncing',
    railScope: null,
    errorMessage: null,
    warningMessage: null,
  }),
  useArkadeRailSnapshot: () => ({
    loadPhase: 'loaded',
    syncPhase: 'not-syncing',
    savePhase: 'not-saving',
  }),
}))

vi.mock('@/hooks/useRailManualSyncMutations', () => ({
  useArkadeManualSyncMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => ({ isLoading: false, data: { confirmedSats: 1, totalSats: 1 } }),
  useArkadeRecoverableVtxoFeeQuery: () => ({ isLoading: false, data: null }),
  useArkadeRecoverRecoverableVtxosMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeAddressQuery: () => ({ data: 'tark1qtest', isLoading: false }),
  useArkadeDelegateInfoQuery: () => ({ data: null }),
  useArkadeRenewMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeVtxoExpiryQuery: () => ({
    isLoading: false,
    data: { earliestExpiresAt: null, expiringSoonCount: 0 },
  }),
  useArkadeOperatorScheduledSessionQuery: () => ({
    isLoading: false,
    data: null,
  }),
  useArkadeSignerMigrationMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
  useArkadeSignerMigrationPartialResultQuery: () => ({ data: null }),
  useArkadeAutonomousModeActive: () => false,
  useHasPendingBatchIntent: () => false,
  useHasPendingBatchIntentKind: () => false,
  usePendingBatchIntent: () => null,
  usePendingBatchIntents: () => [],
  useArkadeBoardingStatusQuery: () => ({ data: undefined }),
  useArkadeCancelPendingBatchIntentMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeRetryPendingBatchIntentMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useOperatorTrustStatusQuery: () => ({
    data: { operatorTrustPending: false, reviewingInAutonomous: false },
  }),
  useOperatorConfigDiffQuery: () => ({ isLoading: false, data: { entries: [] } }),
  useReviewOperatorConfigInAutonomousMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useAcceptOperatorConfigMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeAutonomousModeStatusQuery: () => ({
    isLoading: false,
    data: {
      active: false,
      cachedOperatorInfoPresent: true,
      operatorTrustPending: false,
      canExitAutonomous: true,
      eligibleCount: 0,
      materialsReadyCount: 0,
      materialsMissingCount: 0,
    },
  }),
  useArkadeAutonomousModeMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/components/wallet/ArkadeExitSection', () => ({
  ArkadeExitSection: () => <div data-testid="exit-section" />,
}))

describe('ArkadePanel', () => {
  beforeEach(() => {
    arkadeLoadSnapshot.loadPhase = 'loaded'
    arkadeLoadSnapshot.errorMessage = null
  })

  it('does not link to separate arkade send or receive routes', () => {
    renderWithProviders(<ArkadePanel />)
    expect(screen.queryByRole('link', { name: 'Receive' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Send' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Board from on-chain' })).toBeInTheDocument()
  })

  it('replaces balance and address with the session loading view', () => {
    arkadeLoadSnapshot.loadPhase = 'loading'
    renderWithProviders(<ArkadePanel />)

    expect(screen.getByTestId('arkade-session-loading')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Establishing Arkade session' })).toBeInTheDocument()
    expect(screen.queryByText('tark1qtest')).not.toBeInTheDocument()
    expect(screen.queryByText('Balance')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View VTXOs' })).toBeInTheDocument()
  })

  it('replaces balance and address with the session error view', () => {
    arkadeLoadSnapshot.loadPhase = 'load-error'
    arkadeLoadSnapshot.errorMessage = 'operator unreachable'
    renderWithProviders(<ArkadePanel />)

    expect(screen.getByTestId('arkade-session-load-error')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Arkade session could not be established' }),
    ).toBeInTheDocument()
    expect(screen.getByText('operator unreachable')).toBeInTheDocument()
    expect(screen.queryByText('tark1qtest')).not.toBeInTheDocument()
    expect(screen.getByTestId('exit-section')).toBeInTheDocument()
  })
})
