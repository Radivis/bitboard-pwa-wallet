import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
      options,
    }),
    useNavigate: () => vi.fn(),
  }
})

const mockTerminateWorker = vi.fn()
const mockClearSession = vi.fn()
const mockLockWallet = vi.fn()
const cryptoStoreState = {
  terminateWorker: mockTerminateWorker,
  lockAndPurgeSensitiveRuntimeState: async () => {
    mockLockWallet()
    mockTerminateWorker()
    mockClearSession()
  },
}
vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector(cryptoStoreState),
    {
      getState: () => cryptoStoreState,
    },
  ),
}))

let walletStoreState: Record<string, unknown> = {}
vi.mock('@/stores/walletStore', () => ({
  useWalletStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector(walletStoreState),
    {
      getState: () => walletStoreState,
    },
  ),
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ password: 'testpass', clear: mockClearSession }),
    {
      getState: () => ({ password: 'testpass', clear: mockClearSession }),
    },
  ),
  clearAutoLockTimer: vi.fn(),
}))

const managementDbMocks = vi.hoisted(() => ({
  noMnemonicBackupFlag: false,
}))

vi.mock('@/db', () => ({
  useWallets: () => ({ data: [{ wallet_id: 1, name: 'Test Wallet', created_at: '' }] }),
  useWallet: () => ({
    data: { wallet_id: 1, name: 'Test Wallet', created_at: '' },
    isSuccess: true,
  }),
  useUpdateWallet: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useWalletNoMnemonicBackupFlag: () => ({
    data: managementDbMocks.noMnemonicBackupFlag,
  }),
}))

import { ManagementPage } from '../wallet/management'

describe('ManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    managementDbMocks.noMnemonicBackupFlag = false
    walletStoreState = {
      activeWalletId: 1,
      walletStatus: 'unlocked',
    }
  })

  it('renders wallet management when a wallet is active', () => {
    renderWithProviders(<ManagementPage />)
    expect(screen.getByRole('heading', { name: 'Management' })).toBeInTheDocument()
    expect(screen.getByText('Wallet Management')).toBeInTheDocument()
  })

  it('shows guidance when no wallet is active', () => {
    walletStoreState.activeWalletId = null
    renderWithProviders(<ManagementPage />)
    expect(
      screen.getByText(/Create or import a wallet to manage lock/i),
    ).toBeInTheDocument()
    expect(screen.queryByText('Wallet Management')).not.toBeInTheDocument()
    expect(screen.queryByText('Seed Phrase Backup')).not.toBeInTheDocument()
  })

  it('shows seed phrase backup when a wallet is active', () => {
    renderWithProviders(<ManagementPage />)
    expect(screen.getByText('Seed Phrase Backup')).toBeInTheDocument()
  })

  it('shows stressed backup warning when no mnemonic backup flag is set', () => {
    managementDbMocks.noMnemonicBackupFlag = true
    renderWithProviders(<ManagementPage />)
    expect(
      screen.getByText(/No backup of the seed phrase has been recorded for this wallet/i),
    ).toBeInTheDocument()
  })

  it('show seed phrase opens password dialog', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ManagementPage />)

    await user.click(screen.getByRole('button', { name: 'Show Seed Phrase' }))
    await waitFor(() => {
      expect(screen.getByText('Confirm Bitboard app password')).toBeInTheDocument()
    })
  })

  it('lock wallet clears sensitive state', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ManagementPage />)

    await user.click(screen.getByRole('button', { name: 'Lock Wallet' }))
    expect(mockLockWallet).toHaveBeenCalled()
    expect(mockTerminateWorker).toHaveBeenCalled()
    expect(mockClearSession).toHaveBeenCalled()
  })
})
