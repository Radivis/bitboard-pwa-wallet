import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
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
  lockAndPurgeSensitiveRuntimeState: () => {
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

vi.mock('@/db', () => ({
  useWallets: () => ({ data: [{ wallet_id: 1 }] }),
}))

import { ManagementPage } from '../management'

describe('ManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
