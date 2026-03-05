import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_MNEMONIC_12 } from '@/test-utils/test-providers'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
      options,
    }),
    useNavigate: () => mockNavigate,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  }
})

const mockValidateMnemonic = vi.fn()
const mockCreateWallet = vi.fn()
const mockFullScanWallet = vi.fn()
const mockGetBalance = vi.fn()
const mockGetTransactionList = vi.fn()
vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      validateMnemonic: mockValidateMnemonic,
      createWallet: mockCreateWallet,
      fullScanWallet: mockFullScanWallet,
      getBalance: mockGetBalance,
      getTransactionList: mockGetTransactionList,
    }),
}))

const mockSetActiveWallet = vi.fn()
const mockSetWalletStatus = vi.fn()
const mockSetCurrentAddress = vi.fn()
const mockSetBalance = vi.fn()
const mockSetTransactions = vi.fn()
vi.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      networkMode: 'signet',
      addressType: 'taproot',
      setActiveWallet: mockSetActiveWallet,
      setWalletStatus: mockSetWalletStatus,
      setCurrentAddress: mockSetCurrentAddress,
      setBalance: mockSetBalance,
      setTransactions: mockSetTransactions,
    }),
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setPassword: vi.fn() }),
  startAutoLockTimer: vi.fn(),
}))

const mockMutateAsync = vi.fn().mockResolvedValue(1)
vi.mock('@/db', () => ({
  useAddWallet: () => ({ mutateAsync: mockMutateAsync }),
  getDatabase: vi.fn(),
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
  saveWalletSecrets: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/bitcoin-utils', () => ({
  toBitcoinNetwork: (mode: string) => mode,
  getEsploraUrl: () => 'http://localhost:3002',
}))

vi.mock('@/lib/wallet-utils', () => ({
  loadCustomEsploraUrl: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/components/PasswordStrengthIndicator', () => ({
  PasswordStrengthIndicator: () => <div data-testid="password-strength" />,
}))

import { ImportWalletPage } from '../import'

describe('ImportWalletPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockValidateMnemonic.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders mnemonic textarea and password fields', () => {
    renderWithProviders(<ImportWalletPage />)
    expect(screen.getByLabelText('Seed Phrase')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
  })

  it('word count display updates as words are typed', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    renderWithProviders(<ImportWalletPage />)

    await user.type(screen.getByLabelText('Seed Phrase'), 'one two three')
    expect(screen.getByText(/3 \//)).toBeInTheDocument()
  })

  it('shows Valid mnemonic after debounced validation', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockValidateMnemonic.mockResolvedValue(true)
    renderWithProviders(<ImportWalletPage />)

    await user.type(screen.getByLabelText('Seed Phrase'), TEST_MNEMONIC_12)

    await waitFor(
      () => {
        expect(screen.getByText('Valid mnemonic')).toBeInTheDocument()
      },
      { timeout: 2000 },
    )
  })

  it('shows Invalid mnemonic for invalid words', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockValidateMnemonic.mockResolvedValue(false)
    renderWithProviders(<ImportWalletPage />)

    const invalidWords = 'foo bar baz qux quux corge grault garply waldo fred plugh xyzzy'
    await user.type(screen.getByLabelText('Seed Phrase'), invalidWords)

    await waitFor(
      () => {
        expect(screen.getByText('Invalid mnemonic')).toBeInTheDocument()
      },
      { timeout: 2000 },
    )
  })

  it('password mismatch shows error message', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    renderWithProviders(<ImportWalletPage />)

    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'different')

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
  })

  it('Restore Wallet disabled until mnemonic valid and passwords valid', () => {
    renderWithProviders(<ImportWalletPage />)
    expect(screen.getByRole('button', { name: 'Restore Wallet' })).toBeDisabled()
  })

  it('Restore Wallet enabled when both conditions met', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockValidateMnemonic.mockResolvedValue(true)
    renderWithProviders(<ImportWalletPage />)

    await user.type(screen.getByLabelText('Seed Phrase'), TEST_MNEMONIC_12)

    await waitFor(
      () => {
        expect(screen.getByText('Valid mnemonic')).toBeInTheDocument()
      },
      { timeout: 2000 },
    )

    await user.type(screen.getByLabelText('Password'), 'validpassword123')
    await user.type(screen.getByLabelText('Confirm Password'), 'validpassword123')

    expect(screen.getByRole('button', { name: 'Restore Wallet' })).toBeEnabled()
  })

  it('calls createWallet on submit', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockValidateMnemonic.mockResolvedValue(true)
    mockCreateWallet.mockResolvedValue({
      external_descriptor: 'ext',
      internal_descriptor: 'int',
      first_address: 'tb1test',
      changeset_json: '{}',
    })
    mockFullScanWallet.mockResolvedValue({
      balance: { confirmed: 0, trusted_pending: 0, untrusted_pending: 0, immature: 0, total: 0 },
      changeset_json: '{}',
    })
    mockGetBalance.mockResolvedValue({
      confirmed: 0,
      trusted_pending: 0,
      untrusted_pending: 0,
      immature: 0,
      total: 0,
    })
    mockGetTransactionList.mockResolvedValue([])
    renderWithProviders(<ImportWalletPage />)

    await user.type(screen.getByLabelText('Seed Phrase'), TEST_MNEMONIC_12)
    await waitFor(
      () => expect(screen.getByText('Valid mnemonic')).toBeInTheDocument(),
      { timeout: 2000 },
    )

    await user.type(screen.getByLabelText('Password'), 'validpassword123')
    await user.type(screen.getByLabelText('Confirm Password'), 'validpassword123')

    await user.click(screen.getByRole('button', { name: 'Restore Wallet' }))

    await waitFor(() => {
      expect(mockCreateWallet).toHaveBeenCalled()
    })
  })

  it('shows loading spinner during restore', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockValidateMnemonic.mockResolvedValue(true)
    let resolveCreate: (value: unknown) => void
    mockCreateWallet.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )
    renderWithProviders(<ImportWalletPage />)

    await user.type(screen.getByLabelText('Seed Phrase'), TEST_MNEMONIC_12)
    await waitFor(
      () => expect(screen.getByText('Valid mnemonic')).toBeInTheDocument(),
      { timeout: 2000 },
    )

    await user.type(screen.getByLabelText('Password'), 'validpassword123')
    await user.type(screen.getByLabelText('Confirm Password'), 'validpassword123')

    await user.click(screen.getByRole('button', { name: 'Restore Wallet' }))

    await waitFor(() => {
      expect(screen.getByText('Restoring wallet...')).toBeInTheDocument()
    })

    resolveCreate!({
      external_descriptor: 'ext',
      internal_descriptor: 'int',
      first_address: 'tb1test',
      changeset_json: '{}',
    })
  })
})
