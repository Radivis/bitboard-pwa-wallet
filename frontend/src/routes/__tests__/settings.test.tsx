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
const mockExportChangeset = vi.fn().mockRejectedValue(new Error('no wallet'))
const mockLoadWallet = vi.fn().mockResolvedValue(true)
const mockSyncWallet = vi.fn().mockResolvedValue({ balance: {}, changeset_json: '{}' })
const mockGetBalance = vi.fn().mockResolvedValue({ confirmed: 0, total: 0 })
const mockGetTransactionList = vi.fn().mockResolvedValue([])
const mockGetCurrentAddress = vi.fn().mockResolvedValue('tb1qcurrent')
const cryptoStoreState = {
  terminateWorker: mockTerminateWorker,
  exportChangeset: mockExportChangeset,
  loadWallet: mockLoadWallet,
  syncWallet: mockSyncWallet,
  getBalance: mockGetBalance,
  getTransactionList: mockGetTransactionList,
  getCurrentAddress: mockGetCurrentAddress,
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
const mockSetNetworkMode = vi.fn()
const mockSetAddressType = vi.fn()
const mockLockWallet = vi.fn()
vi.mock('@/stores/walletStore', () => ({
  useWalletStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector(walletStoreState),
    {
      getState: () => walletStoreState,
    },
  ),
  NETWORK_LABELS: {
    regtest: 'Regtest',
    signet: 'Signet',
    testnet: 'Testnet',
    mainnet: 'Mainnet',
  },
}))

const mockClearSession = vi.fn()
const sessionStoreState = { password: 'testpass', clear: mockClearSession }
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector(sessionStoreState),
    {
      getState: () => sessionStoreState,
    },
  ),
  clearAutoLockTimer: vi.fn(),
}))

const mockSetThemeMode = vi.fn()
vi.mock('@/stores/themeStore', () => ({
  useThemeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ themeMode: 'system', setThemeMode: mockSetThemeMode }),
}))

vi.mock('@/db', () => ({
  getDatabase: vi.fn(),
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
  loadWalletSecrets: vi.fn().mockRejectedValue(new Error('Wrong password')),
  useWallets: () => ({ data: [] }),
}))

vi.mock('@/lib/bitcoin-utils', () => ({
  DEFAULT_ESPLORA_URLS: {
    regtest: 'http://localhost:3002',
    signet: 'https://mempool.space/signet/api',
    testnet: 'https://mempool.space/testnet/api',
    mainnet: 'https://mempool.space/api',
  },
  toBitcoinNetwork: (mode: string) => mode,
  getEsploraUrl: () => 'http://localhost:3002',
}))

vi.mock('@/lib/wallet-utils', () => ({
  saveCustomEsploraUrl: vi.fn().mockResolvedValue(undefined),
  deleteCustomEsploraUrl: vi.fn().mockResolvedValue(undefined),
  loadCustomEsploraUrl: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/descriptor-wallet-manager', () => ({
  resolveDescriptorWallet: vi.fn().mockResolvedValue({
    network: 'signet',
    addressType: 'taproot',
    accountId: 0,
    externalDescriptor: 'ext',
    internalDescriptor: 'int',
    changeSet: '{}',
  }),
  updateDescriptorWalletChangeset: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/components/MnemonicGrid', () => ({
  MnemonicGrid: ({ words }: { words: string[] }) => (
    <div data-testid="mnemonic-grid">{words.join(' ')}</div>
  ),
}))

vi.mock('@/components/ConfirmationDialog', () => ({
  ConfirmationDialog: ({
    open,
    onConfirm,
    onCancel,
    title,
  }: {
    open: boolean
    onConfirm: () => void
    onCancel: () => void
    title: string
  }) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}))

import { SettingsPage } from '../settings'

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    walletStoreState = {
      activeWalletId: 1,
      walletStatus: 'unlocked',
      networkMode: 'signet',
      addressType: 'taproot',
      accountId: 0,
      setNetworkMode: mockSetNetworkMode,
      setAddressType: mockSetAddressType,
      setWalletStatus: vi.fn(),
      setBalance: vi.fn(),
      setTransactions: vi.fn(),
      lockWallet: mockLockWallet,
    }
  })

  it('renders all settings sections', () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.getByText('Network')).toBeInTheDocument()
    expect(screen.getByText('Address Type')).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
  })

  it('network selector calls setNetworkMode', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'Testnet' }))
    expect(mockSetNetworkMode).toHaveBeenCalledWith('testnet')
  })

  it('address type selector shows confirmation when wallet exists', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'SegWit (BIP84)' }))
    await waitFor(() => {
      expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument()
    })
    expect(screen.getByText('Change Address Type?')).toBeInTheDocument()
  })

  it('theme selector calls setThemeMode', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: /Dark/ }))
    expect(mockSetThemeMode).toHaveBeenCalledWith('dark')
  })

  it('wallet management visible only with wallet', () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.getByText('Wallet Management')).toBeInTheDocument()

    walletStoreState.activeWalletId = null
    const { unmount } = renderWithProviders(<SettingsPage />)
    expect(screen.queryAllByText('Wallet Management')).toHaveLength(1)
    unmount()
  })

  it('lock wallet calls lockWallet and terminateWorker', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'Lock Wallet' }))
    expect(mockLockWallet).toHaveBeenCalled()
    expect(mockTerminateWorker).toHaveBeenCalled()
    expect(mockClearSession).toHaveBeenCalled()
  })

  it('seed phrase backup visible only with wallet', () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.getByText('Seed Phrase Backup')).toBeInTheDocument()
  })

  it('show seed phrase opens password dialog', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'Show Seed Phrase' }))
    await waitFor(() => {
      expect(screen.getByText('Confirm Password')).toBeInTheDocument()
    })
  })
})
