import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadePendingBatchIntentBanner } from '@/components/wallet/ArkadePendingBatchIntentBanner'
import { ArkadeRecoverableVtxoBanner } from '@/components/wallet/ArkadeRecoverableVtxoBanner'
import { ArkadeBoardPage } from '@/pages/wallet/ArkadeBoardPage'
import { ArkadePanel } from '@/components/wallet/ArkadePanel'
import type { ArkadePendingBatchIntent } from '@/workers/arkade-api'

const pendingIntentsRef = vi.hoisted(() => ({
  current: [] as ArkadePendingBatchIntent[],
}))

const samplePendingIntent: ArkadePendingBatchIntent = {
  kind: 'board',
  intentId: 'intent-1',
  amountSats: 50_000,
  registeredAt: 1_700_000_000,
  onchainOutpoints: [{ txid: 'aa'.repeat(32), vout: 1 }],
  vtxoOutpoints: [],
}

const sampleRecoverIntent: ArkadePendingBatchIntent = {
  kind: 'recover',
  intentId: 'intent-2',
  amountSats: 12_000,
  registeredAt: 1_700_000_001,
  onchainOutpoints: [],
  vtxoOutpoints: [{ txid: 'bb'.repeat(32), vout: 0 }],
}

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      to,
    }: {
      children: React.ReactNode
      to?: string
    }) => <a href={to ?? '#'}>{children}</a>,
  }
})

vi.mock('@/hooks/useArkadeQueries', () => ({
  usePendingBatchIntents: () => pendingIntentsRef.current,
  useHasPendingOnchainBatchIntent: () =>
    pendingIntentsRef.current.some((intent) => intent.onchainOutpoints.length > 0),
  useHasPendingBatchIntentKind: (kind: string) =>
    pendingIntentsRef.current.some((intent) => intent.kind === kind),
  useArkadeCancelPendingBatchIntentMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeRetryPendingBatchIntentMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeOnboardMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeBoardingAddressQuery: () => ({
    isLoading: false,
    data: 'tb1qboarding',
  }),
  useArkadeBoardingStatusQuery: () => ({
    isLoading: false,
    data: {
      boardingAddress: 'tb1qboarding',
      trackedAddresses: ['tb1qboarding'],
      spendableSats: 50_000,
      pendingSats: 0,
      expiredSats: 0,
      pendingBatchIntents: pendingIntentsRef.current,
    },
  }),
  useArkadeBalanceQuery: () => ({
    isLoading: false,
    data: {
      confirmedSats: 1,
      totalSats: 1,
      recoverableSettleableVtxoCount: 1,
      recoverableSettleableSats: 12_000,
      pendingBatchIntents: pendingIntentsRef.current,
    },
  }),
  useArkadeRecoverableVtxoFeeQuery: () => ({
    isLoading: false,
    data: {
      recoverableVtxoCount: 1,
      recoverableTotalSats: 12_000,
      txFeeRate: '2',
      intentFeeConfigured: {
        offchainInput: true,
        onchainInput: false,
        offchainOutput: false,
        onchainOutput: true,
      },
      estimatedTotalFeeSats: 100,
      estimatedReceiveSats: 11_900,
    },
  }),
  useArkadeRecoverRecoverableVtxosMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useArkadeAutonomousModeActive: () => false,
  useArkadeAddressQuery: () => ({ data: 'tark1qtest', isLoading: false }),
  useArkadeDelegateInfoQuery: () => ({ data: null }),
  useArkadeRenewMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeVtxoExpiryQuery: () => ({
    isLoading: false,
    data: { earliestExpiresAt: null, expiringSoonCount: 0 },
  }),
  useArkadeOperatorScheduledSessionQuery: () => ({ isLoading: false, data: null }),
  useArkadeSignerMigrationMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
  useArkadeSignerMigrationPartialResultQuery: () => ({ data: null }),
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

vi.mock('@/hooks/useArkadeLifecycleSnapshots', () => ({
  useArkadeLoadLifecycleSnapshot: () => ({
    loadPhase: 'loaded',
    networkMode: 'signet',
    errorMessage: null,
  }),
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

vi.mock('@/components/wallet/ArkadeExitSection', () => ({
  ArkadeExitSection: () => <div data-testid="exit-section" />,
}))

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

describe('ArkadePendingBatchIntentBanner', () => {
  beforeEach(() => {
    pendingIntentsRef.current = []
  })

  it('hides the banner when no pending intent exists', () => {
    renderWithProviders(<ArkadePendingBatchIntentBanner />)
    expect(
      screen.queryByTestId('arkade-pending-batch-intent-banner'),
    ).not.toBeInTheDocument()
  })

  it('banners_render_one_card_per_intent_with_cancel_retry', () => {
    pendingIntentsRef.current = [samplePendingIntent, sampleRecoverIntent]
    renderWithProviders(<ArkadePendingBatchIntentBanner />)
    expect(screen.getAllByTestId('arkade-pending-batch-intent-banner')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2)
  })

  it('settle_enabled_when_only_recover_intent_pending', () => {
    pendingIntentsRef.current = [sampleRecoverIntent]
    renderWithProviders(
      <>
        <ArkadeBoardPage />
        <ArkadeRecoverableVtxoBanner />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Settle boarding UTXO' })).toBeEnabled()
    expect(screen.getAllByRole('button', { name: 'Recover now' })[0]).toBeDisabled()
  })

  it('disables only overlapping action controls', () => {
    pendingIntentsRef.current = [samplePendingIntent]

    renderWithProviders(
      <>
        <ArkadeBoardPage />
        <ArkadeRecoverableVtxoBanner />
        <ArkadePanel />
      </>,
    )

    expect(screen.getAllByTestId('arkade-pending-batch-intent-banner').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Waiting for Arkade operator').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Settle boarding UTXO' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Recover now' })[0]).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Renew VTXOs now' })).toBeEnabled()
    expect(screen.getAllByRole('button', { name: 'Cancel' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0)
  })
})
