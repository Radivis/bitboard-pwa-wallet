import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
const mockImportWalletAndEncryptSecrets = vi.fn()
const mockFullScanWallet = vi.fn()
const mockGetBalance = vi.fn()
const mockGetTransactionList = vi.fn()
vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      validateMnemonic: mockValidateMnemonic,
      importWalletAndEncryptSecrets: mockImportWalletAndEncryptSecrets,
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
  useWalletStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        networkMode: 'signet',
        addressType: 'taproot',
        accountId: 0,
        setActiveWallet: mockSetActiveWallet,
        setWalletStatus: mockSetWalletStatus,
        setCurrentAddress: mockSetCurrentAddress,
        setBalance: mockSetBalance,
        setTransactions: mockSetTransactions,
      }),
    {
      getState: () => ({ lockWallet: vi.fn() }),
    },
  ),
}))

const mockSessionPassword = { value: 'validpassword123' as string | null }
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: Object.assign(
    (selector: (s: { password: string | null }) => unknown) =>
      selector({
        password: mockSessionPassword.value,
        setPassword: (p: string | null) => {
          mockSessionPassword.value = p
        },
      }),
    {
      getState: () => ({
        password: mockSessionPassword.value,
        setPassword: (p: string | null) => {
          mockSessionPassword.value = p
        },
      }),
    },
  ),
  startAutoLockTimer: vi.fn(),
}))

const mockMutateAsync = vi.fn().mockResolvedValue(1)
vi.mock('@/db', () => ({
  useAddWallet: () => ({ mutateAsync: mockMutateAsync }),
  useWallets: () => ({ data: [], isLoading: false }),
  getDatabase: vi.fn(),
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
  putWalletSecretsEncrypted: vi.fn().mockResolvedValue(undefined),
  persistNewWalletWithSecrets: vi.fn().mockResolvedValue(1),
  walletKeys: { all: ['wallets'] as const },
}))

vi.mock('@/workers/secrets-channel', () => ({
  ensureSecretsChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/bitcoin-utils', () => ({
  toBitcoinNetwork: (mode: string) => mode,
  getEsploraUrl: () => 'http://localhost:3002',
}))

vi.mock('@/lib/wallet-utils', () => ({
  loadCustomEsploraUrl: vi.fn().mockResolvedValue(null),
}))

import { ImportWalletPage } from '../import'

describe('ImportWalletPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockValidateMnemonic.mockResolvedValue(true)
    mockSessionPassword.value = 'validpassword123'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders mnemonic textarea without inline password fields', () => {
    renderWithProviders(<ImportWalletPage />)
    expect(screen.getByLabelText('Seed Phrase')).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Confirm Password')).not.toBeInTheDocument()
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

  it('Restore Wallet disabled until mnemonic valid', () => {
    renderWithProviders(<ImportWalletPage />)
    expect(screen.getByRole('button', { name: 'Restore Wallet' })).toBeDisabled()
  })

  it('Restore Wallet enabled when mnemonic valid', async () => {
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

    expect(screen.getByRole('button', { name: 'Restore Wallet' })).toBeEnabled()
  })

  it('calls importWalletAndEncryptSecrets with session app password', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockValidateMnemonic.mockResolvedValue(true)
    mockImportWalletAndEncryptSecrets.mockResolvedValue({
      encryptedBlob: { ciphertext: new Uint8Array(0), iv: new Uint8Array(12), salt: new Uint8Array(16) },
      walletResult: {
        external_descriptor: 'ext',
        internal_descriptor: 'int',
        first_address: 'tb1test',
        changeset_json: '{}',
      },
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

    await user.click(screen.getByRole('button', { name: 'Restore Wallet' }))

    await waitFor(() => {
      expect(mockImportWalletAndEncryptSecrets).toHaveBeenCalledWith({
        mnemonic: TEST_MNEMONIC_12,
        password: 'validpassword123',
        network: 'signet',
        addressType: 'taproot',
        accountId: 0,
      })
    })
  })

  it('shows loading spinner during restore', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockValidateMnemonic.mockResolvedValue(true)
    let resolveImport: (value: unknown) => void
    mockImportWalletAndEncryptSecrets.mockReturnValue(
      new Promise((resolve) => {
        resolveImport = resolve
      }),
    )
    renderWithProviders(<ImportWalletPage />)

    await user.type(screen.getByLabelText('Seed Phrase'), TEST_MNEMONIC_12)
    await waitFor(
      () => expect(screen.getByText('Valid mnemonic')).toBeInTheDocument(),
      { timeout: 2000 },
    )

    await user.click(screen.getByRole('button', { name: 'Restore Wallet' }))

    await waitFor(() => {
      expect(screen.getByText('Restoring wallet...')).toBeInTheDocument()
    })

    resolveImport!({
      encryptedBlob: { ciphertext: new Uint8Array(0), iv: new Uint8Array(12), salt: new Uint8Array(16) },
      walletResult: {
        external_descriptor: 'ext',
        internal_descriptor: 'int',
        first_address: 'tb1test',
        changeset_json: '{}',
      },
    })
  })
})
