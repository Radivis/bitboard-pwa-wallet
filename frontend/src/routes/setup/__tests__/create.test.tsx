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

const mockCreateWalletAndEncryptSecrets = vi.fn()
vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      createWalletAndEncryptSecrets: mockCreateWalletAndEncryptSecrets,
    }),
}))

const mockSetActiveWallet = vi.fn()
const mockSetWalletStatus = vi.fn()
const mockSetCurrentAddress = vi.fn()
const mockSetBalance = vi.fn()
const mockSetTransactions = vi.fn()
const mockSetLastSyncTime = vi.fn()
const mockCommitLoadedSubWallet = vi.fn()
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
        setLastSyncTime: mockSetLastSyncTime,
        commitLoadedSubWallet: mockCommitLoadedSubWallet,
      }),
    {
      getState: () => ({ lockWallet: vi.fn() }),
    },
  ),
}))

const mockSessionPassword = { value: 'validpassword123' as string | null }
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: Object.assign(
    (selector: (s: { password: string | null; setPassword: (p: string | null) => void }) => unknown) =>
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

const dbMocks = vi.hoisted(() => ({
  mockMutateAsync: vi.fn().mockResolvedValue(1),
  mockPersistNewWalletWithSecrets: vi.fn().mockResolvedValue(1),
  mockSetWalletNoMnemonicBackupFlag: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db', () => ({
  useAddWallet: () => ({ mutateAsync: dbMocks.mockMutateAsync }),
  useWallets: () => ({ data: [], isLoading: false }),
  getDatabase: vi.fn(),
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
  persistNewWalletWithSecrets: dbMocks.mockPersistNewWalletWithSecrets,
  setWalletNoMnemonicBackupFlag: dbMocks.mockSetWalletNoMnemonicBackupFlag,
  walletKeys: {
    all: ['wallets'] as const,
    noMnemonicBackup: (id: number) => ['settings', 'no_mnemonic_backup', id] as const,
  },
}))

vi.mock('@/workers/secrets-channel', () => ({
  ensureSecretsChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/bitcoin-utils', () => ({
  toBitcoinNetwork: (mode: string) => mode,
}))

vi.mock('@/lib/wallet-query-cache-sync', () => ({
  invalidateWalletRelatedQueriesAndNotifyOtherTabs: vi.fn(),
}))

vi.mock('@/components/MnemonicGrid', () => ({
  MnemonicGrid: ({ words }: { words: string[] }) => (
    <div data-testid="mnemonic-grid">{words.join(' ')}</div>
  ),
}))

function mockEncryptedBlob() {
  return {
    ciphertext: new Uint8Array(0),
    iv: new Uint8Array(12),
    salt: new Uint8Array(16),
    kdfVersion: 1 as const,
  }
}

function createWalletCryptoResult(overrides: {
  mnemonicForBackup?: string
  wordCount?: number
} = {}) {
  const blob = mockEncryptedBlob()
  return {
    encryptedPayload: blob,
    encryptedMnemonic: blob,
    walletResult: { first_address: 'addr' },
    mnemonicForBackup: overrides.mnemonicForBackup ?? TEST_MNEMONIC_12,
    ...overrides,
  }
}

import { CreateWalletPage } from '../create'

describe('CreateWalletPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionPassword.value = 'validpassword123'
    dbMocks.mockMutateAsync.mockResolvedValue(1)
    dbMocks.mockPersistNewWalletWithSecrets.mockResolvedValue(1)
    dbMocks.mockSetWalletNoMnemonicBackupFlag.mockResolvedValue(undefined)
  })

  it('renders step 1 with 12 words selected by default', () => {
    renderWithProviders(<CreateWalletPage />)
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Create Wallet' })).toBeInTheDocument()
    expect(screen.getByText('12 Words')).toBeInTheDocument()
    expect(screen.getByText('24 Words')).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('clicking 24 Words then Generate & Continue calls createWalletAndEncryptSecrets with 24', async () => {
    const user = userEvent.setup()
    mockCreateWalletAndEncryptSecrets.mockResolvedValueOnce(
      createWalletCryptoResult({
        mnemonicForBackup: 'a '.repeat(24).trim(),
      }),
    )
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('24 Words'))
    await user.click(screen.getByText('Generate & Continue'))
    expect(mockCreateWalletAndEncryptSecrets).toHaveBeenCalledWith({
      password: 'validpassword123',
      network: 'signet',
      addressType: 'taproot',
      accountId: 0,
      wordCount: 24,
    })
  })

  it('clicking Generate & Continue calls createWalletAndEncryptSecrets with session password', async () => {
    const user = userEvent.setup()
    mockCreateWalletAndEncryptSecrets.mockResolvedValueOnce(createWalletCryptoResult())
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate & Continue'))
    expect(mockCreateWalletAndEncryptSecrets).toHaveBeenCalledWith({
      password: 'validpassword123',
      network: 'signet',
      addressType: 'taproot',
      accountId: 0,
      wordCount: 12,
    })
  })

  it('advances to step 2 on successful create', async () => {
    const user = userEvent.setup()
    mockCreateWalletAndEncryptSecrets.mockResolvedValueOnce(createWalletCryptoResult())
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate & Continue'))

    await waitFor(() => {
      expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    })
    expect(screen.getByText('Backup Seed Phrase')).toBeInTheDocument()
    expect(screen.getByTestId('mnemonic-grid')).toBeInTheDocument()
  })

  it('step 2 displays mnemonic words in grid', async () => {
    const user = userEvent.setup()
    mockCreateWalletAndEncryptSecrets.mockResolvedValueOnce(createWalletCryptoResult())
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate & Continue'))
    await waitFor(() => {
      expect(screen.getByTestId('mnemonic-grid')).toHaveTextContent(TEST_MNEMONIC_12)
    })
  })

  it('step 2 shows warning text', async () => {
    const user = userEvent.setup()
    mockCreateWalletAndEncryptSecrets.mockResolvedValueOnce(createWalletCryptoResult())
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate & Continue'))
    await waitFor(() => {
      const warnings = screen.getAllByText(/Write down these words in order/)
      expect(warnings.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("step 2 I've Written It Down advances to step 3", async () => {
    const user = userEvent.setup()
    mockCreateWalletAndEncryptSecrets.mockResolvedValueOnce(createWalletCryptoResult())
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate & Continue'))
    await waitFor(() => {
      expect(screen.getByText("I've Written It Down")).toBeInTheDocument()
    })
    await user.click(screen.getByText("I've Written It Down"))
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument()
    expect(screen.getByText('Verify Seed Phrase')).toBeInTheDocument()
  })

  it('step 3 shows 3 verification input fields', async () => {
    const user = userEvent.setup()
    mockCreateWalletAndEncryptSecrets.mockResolvedValueOnce(createWalletCryptoResult())
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate & Continue'))
    await waitFor(() => screen.getByText("I've Written It Down"))
    await user.click(screen.getByText("I've Written It Down"))

    const inputs = screen.getAllByPlaceholderText(/Enter word #/)
    expect(inputs).toHaveLength(3)
  })

  it('step 3 Confirm & Finish disabled until correct words entered', async () => {
    const user = userEvent.setup()
    mockCreateWalletAndEncryptSecrets.mockResolvedValueOnce(createWalletCryptoResult())
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate & Continue'))
    await waitFor(() => screen.getByText("I've Written It Down"))
    await user.click(screen.getByText("I've Written It Down"))

    const confirmBtn = screen.getByRole('button', { name: 'Confirm & Finish' })
    expect(confirmBtn).toBeDisabled()
  })

  it('step 3 Confirm & Finish enabled when correct words entered', async () => {
    const user = userEvent.setup()
    mockCreateWalletAndEncryptSecrets.mockResolvedValueOnce(createWalletCryptoResult())
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate & Continue'))
    await waitFor(() => screen.getByText("I've Written It Down"))
    await user.click(screen.getByText("I've Written It Down"))

    const words = TEST_MNEMONIC_12.split(' ')
    const inputs = screen.getAllByPlaceholderText(/Enter word #/)
    for (const input of inputs) {
      const placeholder = input.getAttribute('placeholder')!
      const wordNum = parseInt(placeholder.replace('Enter word #', ''))
      await user.type(input, words[wordNum - 1])
    }

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirm & Finish' })).toBeEnabled()
    })
  })

  it('step 1 Generate & Continue is enabled without typing a password', () => {
    renderWithProviders(<CreateWalletPage />)
    expect(screen.getByRole('button', { name: 'Generate & Continue' })).toBeEnabled()
  })

  it('step indicator shows correct step number', () => {
    renderWithProviders(<CreateWalletPage />)
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })

  it('shows Generate but skip backup button on step 1', () => {
    renderWithProviders(<CreateWalletPage />)
    expect(
      screen.getByRole('button', { name: 'Generate but skip backup' }),
    ).toBeInTheDocument()
  })

  it('opens quick start warning dialog and Abort closes it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByRole('button', { name: 'Generate but skip backup' }))
    expect(screen.getByRole('heading', { name: 'Quick start without viewing backup' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abort' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Quick start without viewing backup' }),
      ).not.toBeInTheDocument()
    })
    expect(mockCreateWalletAndEncryptSecrets).not.toHaveBeenCalled()
  })

  it('Understood! Proceed! creates wallet with no-mnemonic-backup flag and navigates', async () => {
    const user = userEvent.setup()
    mockCreateWalletAndEncryptSecrets.mockResolvedValueOnce(createWalletCryptoResult())
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByRole('button', { name: 'Generate but skip backup' }))
    await user.click(screen.getByRole('button', { name: 'Understood! Proceed!' }))

    await waitFor(() => {
      expect(dbMocks.mockPersistNewWalletWithSecrets).toHaveBeenCalled()
    })
    expect(mockSetBalance).toHaveBeenCalledWith(null)
    expect(mockSetTransactions).toHaveBeenCalledWith([])
    expect(mockSetLastSyncTime).toHaveBeenCalledWith(null)
    expect(dbMocks.mockSetWalletNoMnemonicBackupFlag).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/wallet' })
    expect(screen.queryByText('Step 2 of 3')).not.toBeInTheDocument()
  })
})
