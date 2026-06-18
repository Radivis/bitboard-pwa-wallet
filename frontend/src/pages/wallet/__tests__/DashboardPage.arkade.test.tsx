import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { DashboardPage } from '@/pages/wallet/DashboardPage'

const arkadeHistoryMock = vi.hoisted(() => vi.fn())
const arkadeBalanceMock = vi.hoisted(() => vi.fn())

let walletStoreState: Record<string, unknown> = {}

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
      options,
    }),
    useNavigate: () => vi.fn(),
    Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  }
})

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ isArkadeEnabled: true, isMainnetAccessEnabled: false, isLightningEnabled: false }),
    {
      getState: () => ({
        isArkadeEnabled: true,
        isMainnetAccessEnabled: false,
        isLightningEnabled: false,
      }),
    },
  ),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  const useWalletStoreMock = (selector: (s: Record<string, unknown>) => unknown) =>
    selector(walletStoreState)
  Object.assign(useWalletStoreMock, {
    getState: () => walletStoreState as ReturnType<typeof actual.useWalletStore.getState>,
  })
  return {
    ...actual,
    useWalletStore: useWalletStoreMock,
    NETWORK_LABELS: actual.NETWORK_LABELS,
  }
})

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      syncWallet: vi.fn(),
      getBalance: vi.fn(),
      getTransactionList: vi.fn(),
      exportChangeset: vi.fn(),
    }),
}))

vi.mock('@/hooks/useOnchainDashboardQueries', () => ({
  useOnchainEsploraSyncMetadataQuery: () => ({ data: { isStaleOnchain: false } }),
}))

vi.mock('@/hooks/useLightningMutations', () => ({
  useLightningHistoryQuery: () => ({
    data: { payments: [], stalePaymentsAsOf: undefined },
    isPending: false,
  }),
  useLightningBalancesForDashboardQuery: () => ({
    data: undefined,
    isPending: false,
    isSuccess: false,
  }),
  useNavigatorOnline: () => true,
}))

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => arkadeBalanceMock(),
  useArkadeHistoryQuery: () => arkadeHistoryMock(),
}))

vi.mock('@/hooks/useLabChainStateQuery', () => ({
  useLabChainStateQuery: () => ({ data: null, isPending: false }),
}))

vi.mock('@/hooks/useDashboardActivityPageSize', () => ({
  useDashboardActivityPageSize: () => 10,
}))

vi.mock('@/hooks/useMainnetFiatRatesQuery', () => ({
  useMainnetFiatRatesQuery: () => ({ data: undefined, isPending: false }),
}))

vi.mock('@/lib/wallet/wallet-utils', () => ({
  runIncrementalDashboardWalletSync: vi.fn(),
  runFullScanDashboardWalletSync: vi.fn(),
  retryImportInitialEsploraSyncWithWalletStatus: vi.fn(),
}))

vi.mock('@/components/WalletUnlock', () => ({
  WalletUnlock: () => <div data-testid="wallet-unlock">Unlock</div>,
}))

vi.mock('@/components/TransactionItem', () => ({
  TransactionItem: ({ transaction }: { transaction: { txid: string } }) => (
    <div data-testid={`tx-${transaction.txid}`}>Transaction</div>
  ),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}))

describe('DashboardPage Arkade contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    walletStoreState = {
      activeWalletId: 1,
      walletStatus: 'unlocked',
      networkMode: 'signet',
      addressType: 'taproot',
      accountId: 0,
      loadedDescriptorWallet: {
        networkMode: 'signet',
        addressType: 'taproot',
        accountId: 0,
      },
      balance: {
        confirmedSats: 0,
        trustedPendingSats: 0,
        untrustedPendingSats: 0,
        immatureSats: 0,
        totalSats: 0,
      },
      currentAddress: 'tb1qtest',
      lastSyncTime: null,
      transactions: [],
      importInitialSyncErrorMessage: null,
    }
    arkadeBalanceMock.mockReturnValue({
      isLoading: false,
      data: { confirmedSats: 42_000, totalSats: 42_000 },
    })
    arkadeHistoryMock.mockReturnValue({
      isLoading: false,
      data: [],
    })
  })

  it('DASH-ARK-20 merges Arkade history into activity feed', () => {
    arkadeHistoryMock.mockReturnValue({
      isLoading: false,
      data: [
        {
          direction: 'incoming',
          amountSats: 5_000,
          timestamp: 1_700_000_000,
          txid: 'e2e-arkade-incoming-txid',
          memo: null,
        },
      ],
    })
    renderWithProviders(<DashboardPage />)
    expect(screen.getByTestId('arkade-payment-e2e-arkade-incoming-txid')).toBeInTheDocument()
  })

  it('DASH-ARK-21 shows Arkade activity loading banner', () => {
    arkadeHistoryMock.mockReturnValue({
      isLoading: true,
      data: undefined,
    })
    renderWithProviders(<DashboardPage />)
    expect(screen.getByText('Loading Arkade activity…')).toBeInTheDocument()
  })

  it('DASH-ARK-30 preserves Arkade balance after remount simulating navigation return', () => {
    const { unmount } = renderWithProviders(<DashboardPage />)
    expect(screen.getByTestId('dashboard-arkade-balance-amount')).toBeInTheDocument()
    unmount()

    arkadeBalanceMock.mockReturnValue({
      isLoading: false,
      isFetching: true,
      data: { confirmedSats: 42_000, totalSats: 42_000 },
    })
    renderWithProviders(<DashboardPage />)
    expect(screen.queryByTestId('dashboard-arkade-session-empty')).not.toBeInTheDocument()
    expect(screen.getByTestId('dashboard-arkade-balance-amount')).toBeInTheDocument()
  })
})
