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

const mockPrepareOnchainSendTransaction = vi.fn()
const mockSignAndExtractTransaction = vi.fn()
const mockBroadcastTransaction = vi.fn()
const mockSyncWallet = vi.fn()
const mockGetBalance = vi.fn()
const mockGetTransactionList = vi.fn()
const mockExportChangeset = vi.fn()
const mockBuildAndSignLabTransaction = vi.fn()
const mockGetLabChangeAddress = vi.fn()
const mockDraftLabPsbtTransaction = vi.fn()
const cryptoStoreState = {
  prepareOnchainSendTransaction: mockPrepareOnchainSendTransaction,
  draftLabPsbtTransaction: mockDraftLabPsbtTransaction,
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

vi.mock('@/hooks/useBitcoinUnit', () => ({
  useBitcoinUnit: () => ({ data: 'BTC' }),
}))

vi.mock('@/lib/library/article-shared', () => ({
  ArticleLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/lib/bitcoin-utils', () => ({
  MAX_SAFE_SATS: Number.MAX_SAFE_INTEGER,
  isValidAddress: (address: string, network: string) => {
    if (network === 'signet') return address.startsWith('tb1')
    return false
  },
  truncateAddress: (addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 8)}...${addr.slice(-8)}` : addr,
  getEsploraUrl: () => 'http://localhost:3002',
  toBitcoinNetwork: (mode: string) => mode,
}))

vi.mock('@/lib/wallet-utils', () => ({
  updateWalletChangeset: vi.fn().mockResolvedValue(undefined),
  loadCustomEsploraUrl: vi.fn().mockResolvedValue(null),
}))

vi.mock('qr-scanner', () => ({
  default: class QrScanner {
    static scanImage = vi
      .fn()
      .mockResolvedValue({ data: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx' })

    static async hasCamera() {
      return false
    }

    static async listCameras() {
      return []
    }

    constructor(
      _video: HTMLVideoElement,
      _onDecode: (result: unknown) => void,
      _options?: Record<string, unknown>,
    ) {}

    async start() {}

    stop() {}

    destroy() {}
  },
}))

import { useSendStore } from '@/stores/sendStore'
import { SendPage } from '../wallet/send'

describe('SendPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDraftLabPsbtTransaction.mockResolvedValue({
      psbtBase64: 'draft_psbt',
      finalAmountSats: 10_000,
      originalAmountSats: 10_000,
      raisedToMinDust: false,
      changeFreeBumpAvailable: false,
      changeFreeMaxSats: 0,
    })
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

  it('shows Scan QR code button on send entry', () => {
    renderWithProviders(<SendPage />)
    expect(
      screen.getByRole('button', { name: 'Scan QR code' }),
    ).toBeInTheDocument()
  })

  it('shows Upload image in the QR scan modal', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SendPage />)
    await user.click(screen.getByRole('button', { name: 'Scan QR code' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Upload image' }),
    ).toBeInTheDocument()
  })

  it('shows error for invalid address', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SendPage />)

    await user.type(screen.getByLabelText('Recipient Address'), 'invalid_address')
    expect(screen.getByText(/Invalid address for signet/)).toBeInTheDocument()
  })

  it('amount unit select changes entry unit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SendPage />)

    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('0.00000000')).toBeInTheDocument()
    const unitSelect = screen.getByLabelText('Unit for amount entry')
    expect(unitSelect).toBeInTheDocument()

    await user.selectOptions(unitSelect, 'sat')

    expect(screen.getByPlaceholderText('0')).toBeInTheDocument()
    expect(useSendStore.getState().amountUnit).toBe('sat')
  })

  it('displays available balance', () => {
    renderWithProviders(<SendPage />)
    expect(screen.getByText(/Available:/)).toBeInTheDocument()
    expect(screen.getByText('0.00500000')).toBeInTheDocument()
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
    mockPrepareOnchainSendTransaction.mockResolvedValue({
      psbtBase64: 'mock_psbt_base64',
      finalAmountSats: 100_000,
      originalAmountSats: 100_000,
      raisedToMinDust: false,
      bumpedChangeFree: false,
      changeFreeBumpAvailable: false,
      changeFreeMaxSats: 0,
    })
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

  it('shows change-free choice modal and calls prepare with bump when user chooses max', async () => {
    const user = userEvent.setup()
    mockPrepareOnchainSendTransaction
      .mockResolvedValueOnce({
        psbtBase64: 'psbt_exact',
        finalAmountSats: 5000,
        originalAmountSats: 5000,
        raisedToMinDust: false,
        bumpedChangeFree: false,
        changeFreeBumpAvailable: true,
        changeFreeMaxSats: 9900,
      })
      .mockResolvedValueOnce({
        psbtBase64: 'psbt_bumped',
        finalAmountSats: 9900,
        originalAmountSats: 5000,
        raisedToMinDust: false,
        bumpedChangeFree: true,
        changeFreeBumpAvailable: false,
        changeFreeMaxSats: 0,
      })
    renderWithProviders(<SendPage />)

    await user.type(
      screen.getByLabelText('Recipient Address'),
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    )
    await user.type(screen.getByLabelText(/Amount/), '0.00005')
    await user.click(screen.getByRole('button', { name: 'Review Transaction' }))

    expect(await screen.findByText('Change and fees')).toBeInTheDocument()
    expect(mockPrepareOnchainSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        applyChangeFreeBump: false,
      }),
    )

    await user.click(
      screen.getByRole('button', { name: /Increase to change-free max/ }),
    )

    expect(
      await screen.findByText('Transaction Details', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(mockPrepareOnchainSendTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        applyChangeFreeBump: true,
      }),
    )
  })

  it('advances with one prepare when user keeps exact change-free choice', async () => {
    const user = userEvent.setup()
    mockPrepareOnchainSendTransaction.mockResolvedValueOnce({
      psbtBase64: 'psbt_exact',
      finalAmountSats: 5000,
      originalAmountSats: 5000,
      raisedToMinDust: false,
      bumpedChangeFree: false,
      changeFreeBumpAvailable: true,
      changeFreeMaxSats: 9900,
    })
    renderWithProviders(<SendPage />)

    await user.type(
      screen.getByLabelText('Recipient Address'),
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    )
    await user.type(screen.getByLabelText(/Amount/), '0.00005')
    await user.click(screen.getByRole('button', { name: 'Review Transaction' }))

    expect(await screen.findByText('Change and fees')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Keep exact amount/ }))

    expect(
      await screen.findByText('Transaction Details', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(mockPrepareOnchainSendTransaction).toHaveBeenCalledTimes(1)
  })

  it('Back button returns to compose step', async () => {
    const user = userEvent.setup()
    mockPrepareOnchainSendTransaction.mockResolvedValue({
      psbtBase64: 'mock_psbt_base64',
      finalAmountSats: 100_000,
      originalAmountSats: 100_000,
      raisedToMinDust: false,
      bumpedChangeFree: false,
      changeFreeBumpAvailable: false,
      changeFreeMaxSats: 0,
    })
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
