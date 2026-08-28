import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadePendingBatchIntentBanner } from '@/components/wallet/ArkadePendingBatchIntentBanner'
import { ArkadeRecoverableVtxoBanner } from '@/components/wallet/ArkadeRecoverableVtxoBanner'
import { ArkadeBoardPage } from '@/pages/wallet/ArkadeBoardPage'
import { ArkadePanel } from '@/components/wallet/ArkadePanel'
import type { ArkadePendingBatchIntent } from '@/workers/arkade-api'
import {
  markPendingBatchIntentCancelled,
  resetPendingBatchIntentSessionTracking,
} from '@/lib/arkade/arkade-pending-batch-intent'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'

const pendingIntentsRef = vi.hoisted(() => ({
  current: [] as ArkadePendingBatchIntent[],
}))
const onboardMutationRef = vi.hoisted(() => ({ isPending: false }))
const recoverMutationRef = vi.hoisted(() => ({ isPending: false }))
const renewMutationRef = vi.hoisted(() => ({ isPending: false }))
const boardingAddressQueryRef = vi.hoisted(() => ({
  data: 'tb1qboarding' as string | undefined,
  isPending: false,
  isFetching: false,
  isError: false,
  error: null as Error | null,
}))
const boardingStatusQueryRef = vi.hoisted(() => ({
  boardingAddress: 'tb1qboarding' as string | undefined,
  isPending: false,
  isFetching: false,
}))
const toastSuccess = vi.hoisted(() => vi.fn())
const toastMessage = vi.hoisted(() => vi.fn())

const samplePendingIntent: ArkadePendingBatchIntent = {
  kind: 'board',
  intentId: 'intent-1',
  amountSats: 50_000,
  registeredAt: 1_700_000_000,
  onchainOutpoints: [{ txid: 'aa'.repeat(32), vout: 1 }],
  vtxoOutpoints: [],
  lifecyclePhase: 'timed_out',
}

const sampleRecoverIntent: ArkadePendingBatchIntent = {
  kind: 'recover',
  intentId: 'intent-2',
  amountSats: 12_000,
  registeredAt: 1_700_000_001,
  onchainOutpoints: [],
  vtxoOutpoints: [{ txid: 'bb'.repeat(32), vout: 0 }],
  lifecyclePhase: 'timed_out',
}

const processingBoardIntent: ArkadePendingBatchIntent = {
  ...samplePendingIntent,
  lifecyclePhase: 'processing',
}

const processingRecoverIntent: ArkadePendingBatchIntent = {
  ...sampleRecoverIntent,
  lifecyclePhase: 'processing',
}

const COLLABORATIVE_EXIT_DESTINATION =
  'tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'

const sampleCollaborativeExitIntent: ArkadePendingBatchIntent = {
  kind: 'collaborative_exit',
  intentId: 'intent-exit',
  amountSats: 12_000,
  registeredAt: 1_700_000_002,
  onchainOutpoints: [],
  vtxoOutpoints: [{ txid: 'cc'.repeat(32), vout: 0 }],
  lifecyclePhase: 'timed_out',
  destinationAddress: COLLABORATIVE_EXIT_DESTINATION,
}

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    message: (...args: unknown[]) => toastMessage(...args),
    error: vi.fn(),
  },
}))

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
  useArkadeOnboardMutation: () => ({ mutate: vi.fn(), isPending: onboardMutationRef.isPending }),
  useArkadeBoardingAddressQuery: () => ({
    isLoading: boardingAddressQueryRef.isPending && boardingAddressQueryRef.isFetching,
    isPending: boardingAddressQueryRef.isPending,
    isFetching: boardingAddressQueryRef.isFetching,
    isError: boardingAddressQueryRef.isError,
    error: boardingAddressQueryRef.error,
    data: boardingAddressQueryRef.data,
  }),
  useArkadeBoardingStatusQuery: () => ({
    isLoading: boardingStatusQueryRef.isPending && boardingStatusQueryRef.isFetching,
    isPending: boardingStatusQueryRef.isPending,
    isFetching: boardingStatusQueryRef.isFetching,
    data: {
      boardingAddress: boardingStatusQueryRef.boardingAddress,
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
    isPending: recoverMutationRef.isPending,
  }),
  useArkadeAutonomousModeActive: () => false,
  useArkadeAddressQuery: () => ({ data: 'tark1qtest', isLoading: false }),
  useArkadeDelegateInfoQuery: () => ({ data: null }),
  useArkadeRenewMutation: () => ({ mutate: vi.fn(), isPending: renewMutationRef.isPending }),
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

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  orchestrateArkadeRetryLoad: vi.fn(),
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
    onboardMutationRef.isPending = false
    recoverMutationRef.isPending = false
    renewMutationRef.isPending = false
    boardingAddressQueryRef.data = 'tb1qboarding'
    boardingAddressQueryRef.isPending = false
    boardingAddressQueryRef.isFetching = false
    boardingAddressQueryRef.isError = false
    boardingAddressQueryRef.error = null
    boardingStatusQueryRef.boardingAddress = 'tb1qboarding'
    boardingStatusQueryRef.isPending = false
    boardingStatusQueryRef.isFetching = false
    toastSuccess.mockClear()
    toastMessage.mockClear()
    resetPendingBatchIntentSessionTracking()
  })

  it('hides the banner when no pending intent exists', () => {
    renderWithProviders(<ArkadePendingBatchIntentBanner />)
    expect(
      screen.queryByTestId('arkade-pending-batch-intent-banner'),
    ).not.toBeInTheDocument()
  })

  it('phase2_processing_banner_hides_boarding_actions_and_shows_recover_cancel_retry', () => {
    pendingIntentsRef.current = [processingBoardIntent, processingRecoverIntent]
    renderWithProviders(<ArkadePendingBatchIntentBanner />)
    expect(screen.getAllByTestId('arkade-pending-batch-intent-banner')).toHaveLength(2)
    expect(screen.getAllByTestId('arkade-pending-batch-intent-processing-spinner')).toHaveLength(2)
    expect(screen.getAllByText(/The Arkade server is processing your/)).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)
  })

  it('phase3_timed_out_banner_shows_boarding_retry_without_cancel', () => {
    pendingIntentsRef.current = [samplePendingIntent, sampleRecoverIntent]
    renderWithProviders(<ArkadePendingBatchIntentBanner />)
    expect(screen.getAllByTestId('arkade-pending-batch-intent-banner')).toHaveLength(2)
    expect(screen.getAllByTestId('arkade-pending-batch-intent-timed-out-icon')).toHaveLength(2)
    expect(screen.getAllByText('Waiting for Arkade operator')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1)
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
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0)
  })

  it('submit_spinner_only_in_phase1', () => {
    onboardMutationRef.isPending = true
    recoverMutationRef.isPending = true
    renewMutationRef.isPending = true
    renderWithProviders(
      <>
        <ArkadeBoardPage />
        <ArkadeRecoverableVtxoBanner />
        <ArkadePanel />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Settling…' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Recovering…' })[0]).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Renewing…' })).toBeInTheDocument()
  })

  it('submit_spinner_clears_once_processing_record_exists', () => {
    onboardMutationRef.isPending = true
    recoverMutationRef.isPending = true
    pendingIntentsRef.current = [processingBoardIntent, processingRecoverIntent]
    renderWithProviders(
      <>
        <ArkadeBoardPage />
        <ArkadeRecoverableVtxoBanner />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Settle boarding UTXO' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Settling…' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Recover now' })[0]).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Recovering…' })).not.toBeInTheDocument()
  })

  it('toasts_kind_specific_success_when_pending_record_clears', () => {
    pendingIntentsRef.current = [processingRecoverIntent]
    const { rerender } = renderWithProviders(<ArkadePendingBatchIntentBanner />)
    pendingIntentsRef.current = []
    rerender(<ArkadePendingBatchIntentBanner />)
    expect(toastSuccess).toHaveBeenCalledWith('Recoverable VTXOs settled')
    expect(toastMessage).not.toHaveBeenCalled()
  })

  it('cancel_does_not_toast_success', () => {
    pendingIntentsRef.current = [processingRecoverIntent]
    const { rerender } = renderWithProviders(<ArkadePendingBatchIntentBanner />)
    markPendingBatchIntentCancelled(processingRecoverIntent)
    pendingIntentsRef.current = []
    rerender(<ArkadePendingBatchIntentBanner />)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastMessage).toHaveBeenCalledWith('Intent cancelled')
  })

  it('collaborative_exit_banner_shows_truncated_destination', () => {
    pendingIntentsRef.current = [sampleCollaborativeExitIntent]
    renderWithProviders(<ArkadePendingBatchIntentBanner />)
    const destination = screen.getByTestId('arkade-pending-batch-intent-destination')
    expect(destination).toHaveTextContent('On-chain destination:')
    expect(destination).toHaveTextContent(
      truncateAddress(COLLABORATIVE_EXIT_DESTINATION),
    )
    expect(destination).toHaveAttribute('title', COLLABORATIVE_EXIT_DESTINATION)
  })

  it('banner_omits_destination_when_absent', () => {
    pendingIntentsRef.current = [sampleRecoverIntent]
    renderWithProviders(<ArkadePendingBatchIntentBanner />)
    expect(
      screen.queryByTestId('arkade-pending-batch-intent-destination'),
    ).not.toBeInTheDocument()
  })
})

describe('ArkadeBoardPage boarding address', () => {
  beforeEach(() => {
    pendingIntentsRef.current = []
    onboardMutationRef.isPending = false
    boardingAddressQueryRef.data = 'tb1qboarding'
    boardingAddressQueryRef.isPending = false
    boardingAddressQueryRef.isFetching = false
    boardingAddressQueryRef.isError = false
    boardingAddressQueryRef.error = null
    boardingStatusQueryRef.boardingAddress = 'tb1qboarding'
    boardingStatusQueryRef.isPending = false
    boardingStatusQueryRef.isFetching = false
  })

  it('shows loading while the boarding address query is pending', () => {
    boardingAddressQueryRef.data = undefined
    boardingAddressQueryRef.isPending = true
    boardingStatusQueryRef.boardingAddress = undefined
    renderWithProviders(<ArkadeBoardPage />)
    expect(screen.getByText('Loading boarding address…')).toBeInTheDocument()
    expect(screen.queryByTestId('arkade-boarding-address')).not.toBeInTheDocument()
  })

  it('falls back to boarding status address when the address query is empty', () => {
    boardingAddressQueryRef.data = undefined
    boardingStatusQueryRef.boardingAddress = 'tb1qstatusboarding'
    renderWithProviders(<ArkadeBoardPage />)
    expect(screen.getByTestId('arkade-boarding-address')).toHaveTextContent(
      'tb1qstatusboarding',
    )
    expect(screen.getByRole('button', { name: 'Copy boarding address' })).toBeEnabled()
  })

  it('shows an error instead of an empty address box', () => {
    boardingAddressQueryRef.data = undefined
    boardingAddressQueryRef.isError = true
    boardingAddressQueryRef.error = new Error('operator unreachable')
    boardingStatusQueryRef.boardingAddress = undefined
    renderWithProviders(<ArkadeBoardPage />)
    expect(screen.getByText(/Could not load boarding address/)).toBeInTheDocument()
    expect(screen.getByText(/operator unreachable/)).toBeInTheDocument()
    expect(screen.queryByTestId('arkade-boarding-address')).not.toBeInTheDocument()
  })
})
