import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
      options,
    }),
    useNavigate: () => mockNavigate,
  }
})

const mockSyncWallet = vi.fn()
const mockGetBalance = vi.fn()
const mockGetTransactionList = vi.fn()
const mockExportChangeset = vi.fn()
vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      syncWallet: mockSyncWallet,
      getBalance: mockGetBalance,
      getTransactionList: mockGetTransactionList,
      exportChangeset: mockExportChangeset,
    }),
}))

let walletStoreState: Record<string, unknown> = {}
vi.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(walletStoreState),
  NETWORK_LABELS: {
    lab: 'Lab',
    regtest: 'Regtest',
    signet: 'Signet',
    testnet: 'Testnet',
    mainnet: 'Mainnet',
  },
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ password: 'testpass' }),
}))

vi.mock('@/components/WalletUnlock', () => ({
  WalletUnlock: () => <div data-testid="wallet-unlock">Unlock</div>,
}))

vi.mock('@/components/TransactionItem', () => ({
  TransactionItem: ({ transaction }: { transaction: { txid: string } }) => (
    <div data-testid={`tx-${transaction.txid}`}>Transaction</div>
  ),
}))

vi.mock('@/hooks/useBitcoinUnit', () => ({
  useBitcoinUnit: () => ({ data: 'BTC' }),
}))

vi.mock('@/lib/wallet-utils', () => ({
  runIncrementalDashboardWalletSync: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/hooks/useLightningMutations', () => ({
  useLightningHistoryQuery: () => ({
    data: { payments: [] as unknown[], stalePaymentsAsOf: undefined },
    isPending: false,
  }),
  useLightningBalancesForDashboardQuery: () => ({
    data: undefined,
    isPending: false,
    isSuccess: false,
  }),
  useNavigatorOnline: () => true,
}))

import { DashboardPage } from '../wallet/index'

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    walletStoreState = {
      activeWalletId: 1,
      walletStatus: 'unlocked',
      networkMode: 'signet',
      balance: {
        confirmed: 100_000,
        trusted_pending: 0,
        untrusted_pending: 0,
        immature: 0,
        total: 100_000,
      },
      currentAddress: 'tb1qtest',
      lastSyncTime: null,
      transactions: [],
      setWalletStatus: vi.fn(),
      setBalance: vi.fn(),
      setTransactions: vi.fn(),
      setLastSyncTime: vi.fn(),
    }
  })

  it('redirects to setup when no active wallet', () => {
    walletStoreState.activeWalletId = null
    renderWithProviders(<DashboardPage />)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/setup' })
  })

  it('shows WalletUnlock when locked', () => {
    walletStoreState.walletStatus = 'locked'
    renderWithProviders(<DashboardPage />)
    expect(screen.getByTestId('wallet-unlock')).toBeInTheDocument()
  })

  it('displays balance with BitcoinAmountDisplay', () => {
    renderWithProviders(<DashboardPage />)
    expect(screen.getByText('0.00100000')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'BTC' }).length).toBeGreaterThan(0)
  })

  it('shows on-chain breakdown when pending components are non-zero', () => {
    walletStoreState.balance = {
      confirmed: 100_000,
      trusted_pending: 5_000,
      untrusted_pending: 3_000,
      immature: 0,
      total: 108_000,
    }
    renderWithProviders(<DashboardPage />)
    expect(screen.getByText('0.00108000')).toBeInTheDocument()
    expect(screen.getByText('Spendable (settled)')).toBeInTheDocument()
    expect(screen.getByText('Pending change')).toBeInTheDocument()
    expect(screen.getByText('Pending incoming')).toBeInTheDocument()
  })

  it('shows network badge', () => {
    renderWithProviders(<DashboardPage />)
    expect(screen.getByText('Signet')).toBeInTheDocument()
  })

  it('shows last synced time', () => {
    const syncTime = new Date('2025-01-15T10:30:00')
    walletStoreState.lastSyncTime = syncTime
    renderWithProviders(<DashboardPage />)
    expect(
      screen.getByText(`Last synced: ${syncTime.toLocaleTimeString()}`),
    ).toBeInTheDocument()
  })

  it('shows syncing spinner when syncing', () => {
    walletStoreState.walletStatus = 'syncing'
    renderWithProviders(<DashboardPage />)
    expect(screen.getByText('Syncing wallet...')).toBeInTheDocument()
  })

  it('shows empty activity message when there is no history', () => {
    renderWithProviders(<DashboardPage />)
    expect(
      screen.getByText(/No activity yet/),
    ).toBeInTheDocument()
  })

  it('renders transaction list', () => {
    walletStoreState.transactions = [
      {
        txid: 'abc123',
        sent_sats: 0,
        received_sats: 50_000,
        fee_sats: 200,
        confirmation_block_height: 100,
        confirmation_time: 1700000000,
        is_confirmed: true,
      },
      {
        txid: 'def456',
        sent_sats: 10_000,
        received_sats: 0,
        fee_sats: 150,
        confirmation_block_height: null,
        confirmation_time: null,
        is_confirmed: false,
      },
    ]
    renderWithProviders(<DashboardPage />)
    expect(screen.getByTestId('tx-abc123')).toBeInTheDocument()
    expect(screen.getByTestId('tx-def456')).toBeInTheDocument()
  })
})
