import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadeDashboardBalance } from '@/components/wallet/ArkadeDashboardBalance'
import type { NetworkMode } from '@/stores/walletStore'

const balanceQueryMock = vi.hoisted(() => vi.fn())
const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as NetworkMode,
  arkadeSignerMigrationHint: null as {
    previousSignerPkHex: string
    deprecatedStatus: 'migratable'
    cutoffUnix: number
  } | null,
}))
const arkadeLifecycleState = vi.hoisted(() => ({
  rail: {
    loadPhase: 'loaded' as const,
    syncPhase: 'not-syncing' as const,
    savePhase: 'not-saving' as const,
  },
  load: {
    loadPhase: 'loaded' as const,
    errorMessage: null as string | null,
  },
  sync: {
    syncPhase: 'not-syncing' as const,
    errorMessage: null as string | null,
  },
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode
      to: string
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => balanceQueryMock(),
}))

vi.mock('@/hooks/useArkadeDashboardQueries', () => ({
  useArkadeSyncMetadataQuery: () => ({ data: { isStaleArkade: false } }),
}))

vi.mock('@/hooks/useArkadeLifecycleSnapshots', () => ({
  useArkadeRailSnapshot: () => arkadeLifecycleState.rail,
  useArkadeLoadLifecycleSnapshot: () => arkadeLifecycleState.load,
  useArkadeSyncLifecycleSnapshot: () => arkadeLifecycleState.sync,
}))

vi.mock('@/hooks/useRailManualSyncMutations', () => ({
  useArkadeManualSyncMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ isArkadeEnabled: true, isMainnetAccessEnabled: false }),
    {
      getState: () => ({ isArkadeEnabled: true, isMainnetAccessEnabled: false }),
    },
  ),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: Object.assign(
      (selector: (state: typeof walletStoreState) => unknown) => selector(walletStoreState),
      { getState: () => walletStoreState },
    ),
  }
})

describe('ArkadeDashboardBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    walletStoreState.networkMode = 'signet'
    walletStoreState.arkadeSignerMigrationHint = null
    arkadeLifecycleState.rail = {
      loadPhase: 'loaded',
      syncPhase: 'not-syncing',
      savePhase: 'not-saving',
    }
    arkadeLifecycleState.load = {
      loadPhase: 'loaded',
      errorMessage: null,
    }
    arkadeLifecycleState.sync = {
      syncPhase: 'not-syncing',
      errorMessage: null,
    }
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      data: { confirmedSats: 42_000, totalSats: 42_000 },
    })
  })

  it('DASH-ARK-01 shows card when Arkade active on signet', () => {
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('dashboard-arkade-balance-card')).toBeInTheDocument()
    expect(screen.getByText('Arkade balance')).toBeInTheDocument()
  })

  it('DASH-ARK-02 hides card on lab network', () => {
    walletStoreState.networkMode = 'lab'
    const { container } = renderWithProviders(<ArkadeDashboardBalance />)
    expect(container).toBeEmptyDOMElement()
  })

  it('DASH-ARK-10 shows loading spinner', () => {
    balanceQueryMock.mockReturnValue({ isLoading: true, data: undefined })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('DASH-ARK-11 shows balance and recoverable total when they differ', () => {
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      data: { confirmedSats: 40_000, totalSats: 45_000 },
    })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('dashboard-arkade-balance-amount')).toBeInTheDocument()
    expect(screen.getByText('Total (incl. recoverable):')).toBeInTheDocument()
  })

  it('includes ready-to-settle boarding in headline balance with breakdown', () => {
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      data: {
        confirmedSats: 30_603,
        totalSats: 30_603,
        boardingSpendableSats: 200_000,
        boardingPendingSats: 0,
      },
    })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('dashboard-arkade-balance-amount')).toHaveTextContent('0.00230603')
    expect(screen.getByTestId('arkade-balance-boarding-spendable')).toHaveTextContent(
      'ready to settle in management',
    )
    expect(screen.getByTestId('arkade-balance-settle-in-management-link')).toHaveAttribute(
      'href',
      '/wallet/arkade/board',
    )
  })

  it('DASH-ARK-12 shows empty session copy when no data', () => {
    balanceQueryMock.mockReturnValue({ isLoading: false, isError: false, data: undefined })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('dashboard-arkade-session-empty')).toHaveTextContent(
      'No Arkade session yet',
    )
  })

  it('DASH-ARK-14 shows error copy when balance query fails', () => {
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
    })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('dashboard-arkade-balance-error')).toHaveTextContent(
      'Could not load Arkade balance',
    )
    expect(screen.queryByTestId('dashboard-arkade-session-empty')).not.toBeInTheDocument()
  })

  it('DASH-ARK-13 shows balance not empty copy when cached data exists during refetch', () => {
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      isFetching: true,
      data: { confirmedSats: 42_000, totalSats: 42_000 },
    })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.queryByTestId('dashboard-arkade-session-empty')).not.toBeInTheDocument()
    expect(screen.getByTestId('dashboard-arkade-balance-amount')).toBeInTheDocument()
  })

  it('DASH-ARK-15 shows signer migration banner when operator key rotation is pending', () => {
    walletStoreState.arkadeSignerMigrationHint = {
      previousSignerPkHex: '02abc',
      deprecatedStatus: 'migratable',
      cutoffUnix: 1_785_312_000,
    }
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('arkade-signer-migration-banner')).toBeInTheDocument()
    expect(screen.getByText('Arkade operator signer rotation')).toBeInTheDocument()
  })

  it('DASH-ARK-17 shows pending recovery breakdown when deprecated signer funds are locked', () => {
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      data: {
        confirmedSats: 0,
        totalSats: 50_000,
        pendingRecoverySats: 50_000,
      },
    })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('arkade-balance-pending-recovery')).toHaveTextContent(
      'Pending recovery (deprecated signer)',
    )
  })

  it('DASH-ARK-18 shows zero headline and bumper breakdown when only bumper remains', () => {
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      data: {
        confirmedSats: 50_000,
        offchainSpendableSats: 0,
        onchainBumperSats: 50_000,
        totalSats: 50_000,
      },
    })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('dashboard-arkade-balance-amount')).toHaveTextContent('0.00000000')
    expect(screen.getByTestId('arkade-balance-bumper')).toHaveTextContent('Bumper wallet (exit fees)')
  })

  it('DASH-ARK-16 shows sync error banner when sync fails without balance data', () => {
    balanceQueryMock.mockReturnValue({ isLoading: false, isError: false, data: undefined })
    arkadeLifecycleState.rail.syncPhase = 'sync-error'
    arkadeLifecycleState.sync = {
      syncPhase: 'sync-error',
      errorMessage: 'failed to get VTXOs for addresses',
    }
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('wallet-sync-error-banner-arkade')).toBeInTheDocument()
    expect(screen.getByText('failed to get VTXOs for addresses')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-arkade-session-empty')).toBeInTheDocument()
  })
})
