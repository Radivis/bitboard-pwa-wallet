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

const mockGenerateMnemonic = vi.fn()
const mockCreateWallet = vi.fn()
vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      generateMnemonic: mockGenerateMnemonic,
      createWallet: mockCreateWallet,
    }),
}))

const mockSetActiveWallet = vi.fn()
const mockSetWalletStatus = vi.fn()
const mockSetCurrentAddress = vi.fn()
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
      }),
    {
      getState: () => ({ lockWallet: vi.fn() }),
    },
  ),
}))

const mockSetSessionPassword = vi.fn()
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      setPassword: mockSetSessionPassword,
    }),
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
}))

vi.mock('@/components/PasswordStrengthIndicator', () => ({
  PasswordStrengthIndicator: ({ password }: { password: string }) => (
    <div data-testid="password-strength">{password ? 'strength-shown' : ''}</div>
  ),
}))

vi.mock('@/components/MnemonicGrid', () => ({
  MnemonicGrid: ({ words }: { words: string[] }) => (
    <div data-testid="mnemonic-grid">{words.join(' ')}</div>
  ),
}))

import { CreateWalletPage } from '../create'

describe('CreateWalletPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders step 1 with 12 words selected by default', () => {
    renderWithProviders(<CreateWalletPage />)
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
    expect(screen.getByText('Generate Seed Phrase')).toBeInTheDocument()
    expect(screen.getByText('12 Words')).toBeInTheDocument()
    expect(screen.getByText('24 Words')).toBeInTheDocument()
  })

  it('clicking 24 Words switches word count selection', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CreateWalletPage />)

    const btn24 = screen.getByText('24 Words')
    await user.click(btn24)

    mockGenerateMnemonic.mockResolvedValueOnce('a '.repeat(24).trim())
    await user.click(screen.getByText('Generate Mnemonic'))
    expect(mockGenerateMnemonic).toHaveBeenCalledWith(24)
  })

  it('clicking Generate Mnemonic calls generateMnemonic', async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))
    expect(mockGenerateMnemonic).toHaveBeenCalledWith(12)
  })

  it('advances to step 2 on successful generation', async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))

    await waitFor(() => {
      expect(screen.getByText('Step 2 of 4')).toBeInTheDocument()
    })
    expect(screen.getByText('Backup Seed Phrase')).toBeInTheDocument()
    expect(screen.getByTestId('mnemonic-grid')).toBeInTheDocument()
  })

  it('step 2 displays mnemonic words in grid', async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))
    await waitFor(() => {
      expect(screen.getByTestId('mnemonic-grid')).toHaveTextContent(TEST_MNEMONIC_12)
    })
  })

  it('step 2 shows warning text', async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))
    await waitFor(() => {
      const warnings = screen.getAllByText(/Write down these words in order/)
      expect(warnings.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("step 2 I've Written It Down advances to step 3", async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))
    await waitFor(() => {
      expect(screen.getByText("I've Written It Down")).toBeInTheDocument()
    })
    await user.click(screen.getByText("I've Written It Down"))
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument()
    expect(screen.getByText('Verify Seed Phrase')).toBeInTheDocument()
  })

  it('step 3 shows 3 verification input fields', async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))
    await waitFor(() => screen.getByText("I've Written It Down"))
    await user.click(screen.getByText("I've Written It Down"))

    const inputs = screen.getAllByPlaceholderText(/Enter word #/)
    expect(inputs).toHaveLength(3)
  })

  it('step 3 Confirm disabled until correct words entered', async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))
    await waitFor(() => screen.getByText("I've Written It Down"))
    await user.click(screen.getByText("I've Written It Down"))

    const confirmBtn = screen.getByRole('button', { name: 'Confirm' })
    expect(confirmBtn).toBeDisabled()
  })

  it('step 3 Confirm enabled when correct words entered', async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))
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
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
    })
  })

  it('step 4 shows password and confirm inputs', async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))
    await waitFor(() => screen.getByText("I've Written It Down"))
    await user.click(screen.getByText("I've Written It Down"))

    const words = TEST_MNEMONIC_12.split(' ')
    const inputs = screen.getAllByPlaceholderText(/Enter word #/)
    for (const input of inputs) {
      const wordNum = parseInt(input.getAttribute('placeholder')!.replace('Enter word #', ''))
      await user.type(input, words[wordNum - 1])
    }
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
  })

  it('step 4 shows Passwords do not match error', async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))
    await waitFor(() => screen.getByText("I've Written It Down"))
    await user.click(screen.getByText("I've Written It Down"))

    const words = TEST_MNEMONIC_12.split(' ')
    const inputs = screen.getAllByPlaceholderText(/Enter word #/)
    for (const input of inputs) {
      const wordNum = parseInt(input.getAttribute('placeholder')!.replace('Enter word #', ''))
      await user.type(input, words[wordNum - 1])
    }
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'different')

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
  })

  it('step 4 Create Wallet disabled when password too short', async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))
    await waitFor(() => screen.getByText("I've Written It Down"))
    await user.click(screen.getByText("I've Written It Down"))

    const words = TEST_MNEMONIC_12.split(' ')
    const inputs = screen.getAllByPlaceholderText(/Enter word #/)
    for (const input of inputs) {
      const wordNum = parseInt(input.getAttribute('placeholder')!.replace('Enter word #', ''))
      await user.type(input, words[wordNum - 1])
    }
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Confirm Password'), 'short')

    expect(screen.getByRole('button', { name: 'Create Wallet' })).toBeDisabled()
  })

  it('step 4 Create Wallet enabled when valid', async () => {
    const user = userEvent.setup()
    mockGenerateMnemonic.mockResolvedValueOnce(TEST_MNEMONIC_12)
    renderWithProviders(<CreateWalletPage />)

    await user.click(screen.getByText('Generate Mnemonic'))
    await waitFor(() => screen.getByText("I've Written It Down"))
    await user.click(screen.getByText("I've Written It Down"))

    const words = TEST_MNEMONIC_12.split(' ')
    const inputs = screen.getAllByPlaceholderText(/Enter word #/)
    for (const input of inputs) {
      const wordNum = parseInt(input.getAttribute('placeholder')!.replace('Enter word #', ''))
      await user.type(input, words[wordNum - 1])
    }
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await user.type(screen.getByLabelText('Password'), 'validpassword123')
    await user.type(screen.getByLabelText('Confirm Password'), 'validpassword123')

    expect(screen.getByRole('button', { name: 'Create Wallet' })).toBeEnabled()
  })

  it('step indicator shows correct step number', () => {
    renderWithProviders(<CreateWalletPage />)
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
  })
})
