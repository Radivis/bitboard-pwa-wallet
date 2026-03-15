import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- route path not used in mock
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

vi.mock('@/lib/bitcoin-utils', () => ({
  formatBTC: (sats: number) => (sats / 100_000_000).toFixed(8),
  formatSats: (sats: number) => sats.toLocaleString(),
  getEsploraUrl: () => 'http://localhost:3002',
}))

vi.mock('@/lib/wallet-utils', () => ({
  updateWalletChangeset: vi.fn().mockResolvedValue(undefined),
  loadCustomEsploraUrl: vi.fn().mockResolvedValue(null),
}))

import { DashboardPage } from '../index'

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

  it('displays balance in BTC and sats', () => {
    renderWithProviders(<DashboardPage />)
    expect(screen.getByText('0.00100000')).toBeInTheDocument()
    expect(screen.getByText('100,000 sats')).toBeInTheDocument()
  })

  it('shows pending sats when pending > 0', () => {
    walletStoreState.balance = {
      confirmed: 100_000,
      trusted_pending: 5_000,
      untrusted_pending: 3_000,
      immature: 0,
      total: 108_000,
    }
    renderWithProviders(<DashboardPage />)
    expect(screen.getByText(/8,000 sats pending/)).toBeInTheDocument()
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

  it('shows empty transaction message', () => {
    renderWithProviders(<DashboardPage />)
    expect(
      screen.getByText(/No transactions yet/),
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
