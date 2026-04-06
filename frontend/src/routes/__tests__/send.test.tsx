import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const mockBuildTransaction = vi.fn()
const mockSignAndExtractTransaction = vi.fn()
const mockBroadcastTransaction = vi.fn()
const mockSyncWallet = vi.fn()
const mockGetBalance = vi.fn()
const mockGetTransactionList = vi.fn()
const mockExportChangeset = vi.fn()
const mockBuildAndSignLabTransaction = vi.fn()
const mockGetLabChangeAddress = vi.fn()
const cryptoStoreState = {
  buildTransaction: mockBuildTransaction,
  signAndExtractTransaction: mockSignAndExtractTransaction,
  broadcastTransaction: mockBroadcastTransaction,
  syncWallet: mockSyncWallet,
  getBalance: mockGetBalance,
  getTransactionList: mockGetTransactionList,
  exportChangeset: mockExportChangeset,
  buildAndSignLabTransaction: mockBuildAndSignLabTransaction,
  getLabChangeAddress: mockGetLabChangeAddress,
}
vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector(cryptoStoreState),
    { getState: () => cryptoStoreState },
  ),
}))

let walletStoreState: Record<string, unknown> = {}
vi.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(walletStoreState),
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ password: 'testpass' }),
}))

vi.mock('@/components/WalletUnlock', () => ({
  WalletUnlock: () => <div data-testid="wallet-unlock">Unlock</div>,
}))

vi.mock('@/lib/bitcoin-utils', () => ({
  MAX_SAFE_SATS: Number.MAX_SAFE_INTEGER,
  isValidAddress: (address: string, network: string) => {
    if (network === 'signet') return address.startsWith('tb1')
    return false
  },
  formatBTC: (sats: number) => (sats / 100_000_000).toFixed(8),
  formatSats: (sats: number) => sats.toLocaleString(),
  truncateAddress: (addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 8)}...${addr.slice(-8)}` : addr,
  getEsploraUrl: () => 'http://localhost:3002',
  toBitcoinNetwork: (mode: string) => mode,
}))

vi.mock('@/lib/wallet-utils', () => ({
  updateWalletChangeset: vi.fn().mockResolvedValue(undefined),
  loadCustomEsploraUrl: vi.fn().mockResolvedValue(null),
}))

import { useSendStore } from '@/stores/sendStore'
import { SendPage } from '../wallet/send'

describe('SendPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSendStore.getState().reset()
    walletStoreState = {
      activeWalletId: 1,
      walletStatus: 'unlocked',
      networkMode: 'signet',
      balance: { confirmed: 500_000, trusted_pending: 0, untrusted_pending: 0, immature: 0, total: 500_000 },
      setWalletStatus: vi.fn(),
      setBalance: vi.fn(),
      setTransactions: vi.fn(),
      setLastSyncTime: vi.fn(),
    }
  })

  it('redirects to setup when no active wallet', () => {
    walletStoreState.activeWalletId = null
    renderWithProviders(<SendPage />)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/setup' })
  })

  it('shows WalletUnlock when locked', () => {
    walletStoreState.walletStatus = 'locked'
    renderWithProviders(<SendPage />)
    expect(screen.getByTestId('wallet-unlock')).toBeInTheDocument()
  })

  it('shows error for invalid address', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SendPage />)

    await user.type(screen.getByLabelText('Recipient Address'), 'invalid_address')
    expect(screen.getByText(/Invalid address for signet/)).toBeInTheDocument()
  })

  it('BTC sats toggle switches unit display', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SendPage />)

    expect(screen.getByLabelText('Amount (BTC)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('0.00000000')).toBeInTheDocument()
    expect(screen.getByText('Switch to sats')).toBeInTheDocument()

    await user.click(screen.getByText('Switch to sats'))

    expect(screen.getByLabelText('Amount (sats)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('0')).toBeInTheDocument()
    expect(screen.getByText('Switch to BTC')).toBeInTheDocument()
  })

  it('displays available balance', () => {
    renderWithProviders(<SendPage />)
    expect(screen.getByText(/Available:/)).toBeInTheDocument()
    expect(screen.getByText(/500,000 sats/)).toBeInTheDocument()
  })

  it('fee rate presets toggle correctly', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SendPage />)

    const lowBtn = screen.getByRole('button', { name: /Low/ })
    const mediumBtn = screen.getByRole('button', { name: /Medium/ })
    expect(lowBtn).toBeInTheDocument()
    expect(mediumBtn).toBeInTheDocument()

    await user.click(mediumBtn)
  })

  it('custom fee input appears when Custom selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SendPage />)

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByPlaceholderText('Custom fee rate')).toBeInTheDocument()
  })

  it('Review Transaction disabled with invalid inputs', () => {
    renderWithProviders(<SendPage />)
    expect(screen.getByRole('button', { name: 'Review Transaction' })).toBeDisabled()
  })

  it('Review Transaction enabled with valid inputs', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SendPage />)

    await user.type(
      screen.getByLabelText('Recipient Address'),
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    )
    await user.type(screen.getByLabelText(/Amount/), '0.001')

    expect(screen.getByRole('button', { name: 'Review Transaction' })).toBeEnabled()
  })

  it('review step shows transaction details', async () => {
    const user = userEvent.setup()
    mockBuildTransaction.mockResolvedValue('mock_psbt_base64')
    renderWithProviders(<SendPage />)

    await user.type(
      screen.getByLabelText('Recipient Address'),
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    )
    await user.type(screen.getByLabelText(/Amount/), '0.001')
    await user.click(screen.getByRole('button', { name: 'Review Transaction' }))

    expect(
      await screen.findByText('Transaction Details', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  it('Back button returns to compose step', async () => {
    const user = userEvent.setup()
    mockBuildTransaction.mockResolvedValue('mock_psbt_base64')
    renderWithProviders(<SendPage />)

    await user.type(
      screen.getByLabelText('Recipient Address'),
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    )
    await user.type(screen.getByLabelText(/Amount/), '0.001')
    await user.click(screen.getByRole('button', { name: 'Review Transaction' }))

    expect(
      await screen.findByText('Transaction Details', {}, { timeout: 3000 }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Back/ }))
    expect(screen.getByText('Send Bitcoin')).toBeInTheDocument()
  })
})
