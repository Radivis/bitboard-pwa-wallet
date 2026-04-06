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
const mockLockWallet = vi.fn()
const mockClearSession = vi.fn()
const cryptoStoreState = {
  terminateWorker: mockTerminateWorker,
  exportChangeset: mockExportChangeset,
  loadWallet: mockLoadWallet,
  syncWallet: mockSyncWallet,
  getBalance: mockGetBalance,
  getTransactionList: mockGetTransactionList,
  getCurrentAddress: mockGetCurrentAddress,
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
const mockSetNetworkMode = vi.fn()
const mockSetAddressType = vi.fn()
const mockSetCurrentAddress = vi.fn()
const mockCommitLoadedSubWallet = vi.fn()
vi.mock('@/stores/walletStore', () => ({
  useWalletStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector(walletStoreState),
    {
      getState: () => walletStoreState,
    },
  ),
  NETWORK_LABELS: {
    lab: 'Lab',
    regtest: 'Regtest',
    signet: 'Signet',
    testnet: 'Testnet',
    mainnet: 'Mainnet',
  },
  getSubWalletLabel: (network: string, addressType: string) =>
    `${network} ${addressType}`,
  selectCommittedNetworkMode: (s: {
    loadedSubWallet: { networkMode: string } | null
    networkMode: string
  }) => s.loadedSubWallet?.networkMode ?? s.networkMode,
  selectCommittedAddressType: (s: {
    loadedSubWallet: { addressType: string } | null
    addressType: string
  }) => s.loadedSubWallet?.addressType ?? s.addressType,
  getCommittedNetworkMode: () => {
    const s = walletStoreState as {
      loadedSubWallet: { networkMode: string } | null
      networkMode: string
    }
    return s.loadedSubWallet?.networkMode ?? s.networkMode
  },
}))

const mockSetSessionPassword = vi.fn()
const sessionStoreState = {
  password: 'testpass',
  clear: mockClearSession,
  setPassword: mockSetSessionPassword,
}
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

const nearZeroSecurityState = { active: false }
vi.mock('@/stores/nearZeroSecurityStore', () => ({
  useNearZeroSecurityStore: (selector: (s: typeof nearZeroSecurityState) => unknown) =>
    selector(nearZeroSecurityState),
}))

const mockSetThemeMode = vi.fn()
vi.mock('@/stores/themeStore', () => ({
  useThemeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ themeMode: 'system', setThemeMode: mockSetThemeMode }),
}))

const mockWalletsState: { data: { wallet_id: number; name: string; created_at: string }[] } = {
  data: [],
}
vi.mock('@/db', () => ({
  getDatabase: vi.fn(),
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
  loadWalletSecrets: vi.fn().mockRejectedValue(new Error('Wrong password')),
  useWallets: () => ({ data: mockWalletsState.data }),
}))

vi.mock('@/lib/bitcoin-utils', () => ({
  DEFAULT_ESPLORA_URLS: {
    regtest: 'http://localhost:3002',
    signet: 'https://mutinynet.com/api',
    testnet: 'https://mempool.space/testnet/api',
    mainnet: 'https://mempool.space/api',
  },
  toBitcoinNetwork: (mode: string) => mode,
  getEsploraUrl: () => 'http://localhost:3002',
}))

const mockLoadDescriptorWalletAndSync = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
)
const mockLoadDescriptorWalletWithoutSync = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
)
vi.mock('@/lib/wallet-utils', () => ({
  saveCustomEsploraUrl: vi.fn().mockResolvedValue(undefined),
  deleteCustomEsploraUrl: vi.fn().mockResolvedValue(undefined),
  loadCustomEsploraUrl: vi.fn().mockResolvedValue(null),
  syncActiveWalletAndUpdateState: vi.fn().mockResolvedValue(undefined),
  syncLoadedSubWalletWithEsplora: vi.fn().mockResolvedValue('completed'),
  runIncrementalDashboardWalletSync: vi.fn().mockResolvedValue(undefined),
  loadDescriptorWalletAndSync: mockLoadDescriptorWalletAndSync,
  loadDescriptorWalletWithoutSync: mockLoadDescriptorWalletWithoutSync,
  loadWalletHandlingPersistedChainMismatch: vi.fn(
    async (
      loadWallet: (params: Record<string, unknown>) => Promise<boolean>,
      params: Record<string, unknown>,
    ) => {
      await loadWallet(params)
    },
  ),
}))

const mockResolveDescriptorWallet = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    network: 'signet',
    addressType: 'taproot',
    accountId: 0,
    externalDescriptor: 'ext',
    internalDescriptor: 'int',
    changeSet: '{}',
    fullScanDone: false,
  }),
)
const mockUpdateDescriptorWalletChangeset = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
)
vi.mock('@/lib/descriptor-wallet-manager', () => ({
  resolveDescriptorWallet: mockResolveDescriptorWallet,
  updateDescriptorWalletChangeset: mockUpdateDescriptorWalletChangeset,
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
    nearZeroSecurityState.active = false
    mockWalletsState.data = []
    sessionStoreState.password = 'testpass'
    walletStoreState = {
      activeWalletId: 1,
      walletStatus: 'unlocked',
      networkMode: 'signet',
      addressType: 'taproot',
      accountId: 0,
      loadedSubWallet: null,
      setNetworkMode: mockSetNetworkMode,
      setAddressType: mockSetAddressType,
      commitLoadedSubWallet: mockCommitLoadedSubWallet,
      setWalletStatus: vi.fn(),
      setCurrentAddress: mockSetCurrentAddress,
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
    expect(screen.getByText('Security')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
  })

  it('disables Change app password when there are no wallets', () => {
    mockWalletsState.data = []
    renderWithProviders(<SettingsPage />)
    expect(screen.getByRole('button', { name: 'Change app password' })).toBeDisabled()
  })

  it('enables Change app password when at least one wallet exists', () => {
    mockWalletsState.data = [
      { wallet_id: 1, name: 'Test', created_at: new Date().toISOString() },
    ]
    renderWithProviders(<SettingsPage />)
    expect(screen.getByRole('button', { name: 'Change app password' })).toBeEnabled()
  })

  it('shows Set a real password when near-zero security mode is active', () => {
    nearZeroSecurityState.active = true
    mockWalletsState.data = []
    renderWithProviders(<SettingsPage />)
    expect(screen.getByRole('button', { name: 'Set a real password' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Change app password' })).not.toBeInTheDocument()
  })

  it('network selector commits loaded sub-wallet after switch completes', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'Testnet' }))
    await waitFor(() => {
      expect(mockCommitLoadedSubWallet).toHaveBeenCalledWith({
        networkMode: 'testnet',
        addressType: 'taproot',
        accountId: 0,
      })
    })
  })

  it('network selector prompts to unlock when there is no session password and does not change network yet', async () => {
    walletStoreState.walletStatus = 'locked'
    sessionStoreState.password = null
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'Testnet' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Unlock Wallet' })).toBeInTheDocument()
    expect(mockSetNetworkMode).not.toHaveBeenCalled()
  })

  it('network selector prompts to unlock when walletStatus is none after reload but session is missing', async () => {
    walletStoreState.walletStatus = 'none'
    sessionStoreState.password = null
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'Testnet' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mockSetNetworkMode).not.toHaveBeenCalled()
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

  it('network switch when unlocked calls updateDescriptorWalletChangeset then resolveDescriptorWallet in order', async () => {
    mockExportChangeset.mockResolvedValueOnce('{"last_reveal":{"0":0}}')
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'Testnet' }))

    await waitFor(() => {
      expect(mockUpdateDescriptorWalletChangeset).toHaveBeenCalledWith({
        password: 'testpass',
        walletId: 1,
        network: 'signet',
        addressType: 'taproot',
        accountId: 0,
        changesetJson: '{"last_reveal":{"0":0}}',
      })
    })
    expect(mockResolveDescriptorWallet).toHaveBeenCalledWith({
      password: 'testpass',
      walletId: 1,
      targetNetwork: 'testnet',
      targetAddressType: 'taproot',
      targetAccountId: 0,
    })
    const updateCallOrder = mockUpdateDescriptorWalletChangeset.mock.invocationCallOrder[0]
    const resolveCallOrder = mockResolveDescriptorWallet.mock.invocationCallOrder[0]
    expect(updateCallOrder).toBeLessThan(resolveCallOrder)
  })
})
