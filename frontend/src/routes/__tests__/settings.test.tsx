import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
import { toast } from 'sonner'

const featureStoreState = vi.hoisted(() => {
  const state = {
    lightningEnabled: false,
    mainnetAccessEnabled: false,
    regtestModeEnabled: false,
    segwitAddressesEnabled: false,
    setLightningEnabled: vi.fn(),
    setMainnetAccessEnabled: vi.fn(),
    setRegtestModeEnabled: vi.fn(),
    setSegwitAddressesEnabled: vi.fn(),
  }
  state.setLightningEnabled.mockImplementation((enabled: boolean) => {
    state.lightningEnabled = enabled
  })
  state.setMainnetAccessEnabled.mockImplementation((enabled: boolean) => {
    state.mainnetAccessEnabled = enabled
  })
  state.setRegtestModeEnabled.mockImplementation((enabled: boolean) => {
    state.regtestModeEnabled = enabled
  })
  state.setSegwitAddressesEnabled.mockImplementation((enabled: boolean) => {
    state.segwitAddressesEnabled = enabled
  })
  return state
})

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (s: typeof featureStoreState) => unknown) =>
      selector(featureStoreState),
    {
      getState: () => featureStoreState,
    },
  ),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    createFileRoute: (_path: string) => (options: Record<string, unknown>) => ({
      options,
    }),
    useNavigate: () => vi.fn(),
    useSearch: () => ({}),
    Link: ({
      children,
      to,
      className,
    }: {
      children: React.ReactNode
      to: string
      className?: string
    }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
  }
})

const mockTerminateWorker = vi.fn()
/** Matches WASM when nothing is loaded — persisted path in switch is skipped. */
const mockExportChangeset = vi.fn().mockRejectedValue(
  new Error(
    'No active wallet. Call create_wallet or load_wallet first.',
  ),
)
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
const mockSetNetworkMode = vi.fn()
const mockSetAddressType = vi.fn()
const mockSetCurrentAddress = vi.fn()
const mockCommitLoadedSubWallet = vi.fn()
vi.mock('@/stores/walletStore', async () => {
  const { AddressType } = await import('@/lib/wallet-domain-types')
  return {
    AddressType,
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
    selectCommittedAccountId: (s: {
      loadedSubWallet: { accountId: number } | null
      accountId: number
    }) => s.loadedSubWallet?.accountId ?? s.accountId,
  }
})

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

vi.mock('@/lib/opfs-root-file', () => ({
  opfsRootFileExists: vi.fn().mockResolvedValue(false),
  readBlobFromOpfsRootIfExists: vi.fn(),
  readTextFileFromOpfsRootIfExists: vi.fn(),
  triggerBrowserSaveLocalBlob: vi.fn(),
}))

vi.mock('@/lib/mainnet-onchain-balance-probe', () => ({
  listWalletsWithPositiveMainnetOnChainBalance: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/wipe-all-app-data-opfs-and-reload', () => ({
  wipeAllAppDataOpfsAndReload: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db/wallet-no-mnemonic-backup', () => ({
  anyWalletHasNoMnemonicBackupFlag: vi.fn().mockResolvedValue(false),
}))

const mockSetThemeMode = vi.fn()
vi.mock('@/stores/themeStore', () => ({
  useThemeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ themeMode: 'system', setThemeMode: mockSetThemeMode }),
}))

const mockWalletsState: { data: { wallet_id: number; name: string; created_at: string }[] } = {
  data: [],
}
const mockLoadWalletSecretsPayload = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    descriptorWallets: [
      {
        network: 'signet',
        addressType: 'taproot',
        accountId: 0,
        externalDescriptor: 'tr([mock]/0/*)',
        internalDescriptor: 'tr([mock]/1/*)',
        changeSet: '{}',
        fullScanDone: true,
      },
    ],
    lightningNwcConnections: [],
  }),
)
vi.mock('@/db', () => ({
  getDatabase: vi.fn(),
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
  loadWalletSecrets: vi.fn().mockRejectedValue(new Error('Wrong password')),
  loadWalletSecretsPayload: mockLoadWalletSecretsPayload,
  useWallets: () => ({ data: mockWalletsState.data }),
}))

vi.mock('@/lib/bitcoin-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bitcoin-utils')>()
  return {
    ...actual,
    /** Avoid live Esplora fetches in settings tests; keep real `toBitcoinNetwork` for switches. */
    getEsploraUrl: () => 'http://localhost:3002',
  }
})

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
vi.mock('@/lib/descriptor-wallet-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/descriptor-wallet-manager')>()
  return {
    ...actual,
    resolveDescriptorWallet: mockResolveDescriptorWallet,
    updateDescriptorWalletChangeset: mockUpdateDescriptorWalletChangeset,
  }
})

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

import { GITHUB_CHANGELOG_URL } from '@common/public-links'
import { SettingsMainPage } from '../settings/index'
import { SettingsSecurityPage } from '../settings/security'
import { SettingsFeaturesPage } from '../settings/features'
import { SettingsAboutPage } from '../settings/about'

describe('Settings routes', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    featureStoreState.lightningEnabled = false
    featureStoreState.mainnetAccessEnabled = false
    featureStoreState.regtestModeEnabled = false
    featureStoreState.segwitAddressesEnabled = false
    featureStoreState.setLightningEnabled.mockImplementation((enabled: boolean) => {
      featureStoreState.lightningEnabled = enabled
    })
    featureStoreState.setMainnetAccessEnabled.mockImplementation((enabled: boolean) => {
      featureStoreState.mainnetAccessEnabled = enabled
    })
    featureStoreState.setRegtestModeEnabled.mockImplementation((enabled: boolean) => {
      featureStoreState.regtestModeEnabled = enabled
    })
    featureStoreState.setSegwitAddressesEnabled.mockImplementation((enabled: boolean) => {
      featureStoreState.segwitAddressesEnabled = enabled
    })
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

  describe('SettingsMainPage', () => {
  it('renders core main sections (Address Type hidden when SegWit feature is off)', () => {
    renderWithProviders(<SettingsMainPage />)
    expect(screen.getByText('Network')).toBeInTheDocument()
    expect(screen.queryByText('Address Type')).not.toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('Bitcoin amounts')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Security' })).not.toBeInTheDocument()
    expect(screen.queryByText('Data Backups')).not.toBeInTheDocument()
  })

  it('shows Address Type card when SegWit addresses feature is enabled', () => {
    featureStoreState.segwitAddressesEnabled = true
    renderWithProviders(<SettingsMainPage />)
    expect(screen.getByText('Address Type')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Taproot (BIP86)' }),
    ).toBeInTheDocument()
  })

  it('network selector commits loaded sub-wallet after switch completes', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsMainPage />)

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
    renderWithProviders(<SettingsMainPage />)

    await user.click(screen.getByRole('button', { name: 'Testnet' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Unlock Wallet' })).toBeInTheDocument()
    expect(mockSetNetworkMode).not.toHaveBeenCalled()
  })

  it('network selector prompts to unlock when walletStatus is none after reload but session is missing', async () => {
    walletStoreState.walletStatus = 'none'
    sessionStoreState.password = null
    const user = userEvent.setup()
    renderWithProviders(<SettingsMainPage />)

    await user.click(screen.getByRole('button', { name: 'Testnet' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mockSetNetworkMode).not.toHaveBeenCalled()
  })

  it('address type selector shows confirmation when wallet exists', async () => {
    featureStoreState.segwitAddressesEnabled = true
    const user = userEvent.setup()
    renderWithProviders(<SettingsMainPage />)

    await user.click(screen.getByRole('button', { name: 'SegWit (BIP84)' }))
    await waitFor(() => {
      expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument()
    })
    expect(screen.getByText('Change Address Type?')).toBeInTheDocument()
  })

  it('theme selector calls setThemeMode', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsMainPage />)

    await user.click(screen.getByRole('button', { name: /Dark/ }))
    expect(mockSetThemeMode).toHaveBeenCalledWith('dark')
  })

  it('network switch when unlocked calls updateDescriptorWalletChangeset then resolveDescriptorWallet in order', async () => {
    mockExportChangeset.mockResolvedValueOnce('{"last_reveal":{"0":0}}')
    const user = userEvent.setup()
    renderWithProviders(<SettingsMainPage />)

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

  it('hides Regtest network button when Regtest mode is disabled', () => {
    featureStoreState.regtestModeEnabled = false
    renderWithProviders(<SettingsMainPage />)
    expect(screen.queryByRole('button', { name: 'Regtest' })).not.toBeInTheDocument()
  })

  it('shows Regtest network button when Regtest mode is enabled', () => {
    featureStoreState.regtestModeEnabled = true
    renderWithProviders(<SettingsMainPage />)
    expect(screen.getByRole('button', { name: 'Regtest' })).toBeInTheDocument()
  })

  it('shows a toast when Mainnet is tapped while Mainnet access is off', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsMainPage />)

    await user.click(screen.getByRole('button', { name: 'Mainnet' }))

    expect(vi.mocked(toast.info)).toHaveBeenCalledWith(
      'Activate Mainnet access in Settings → Features before selecting Mainnet.',
    )
  })

  it('shows receiving descriptor when a wallet exists and session is unlocked', async () => {
    const user = userEvent.setup()
    mockWalletsState.data = [
      { wallet_id: 1, name: 'Test', created_at: new Date().toISOString() },
    ]
    sessionStoreState.password = 'testpass'
    renderWithProviders(<SettingsMainPage />)
    expect(screen.getByText('Receiving descriptor')).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Show receiving descriptor' }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Show receiving descriptor' }))
    expect(screen.getByText('tr([mock]/0/*)')).toBeInTheDocument()
    expect(mockLoadWalletSecretsPayload).toHaveBeenCalled()
  })

  it('shows unlock hint for receiving descriptor when session has no password', () => {
    mockWalletsState.data = [
      { wallet_id: 1, name: 'Test', created_at: new Date().toISOString() },
    ]
    sessionStoreState.password = null
    renderWithProviders(<SettingsMainPage />)
    expect(
      screen.getByText('Unlock your wallet to view the receiving descriptor.'),
    ).toBeInTheDocument()
  })
  })

  describe('SettingsSecurityPage', () => {
  it('disables wallet backup export/import in near-zero security mode with hint', () => {
    nearZeroSecurityState.active = true
    renderWithProviders(<SettingsSecurityPage />)
    expect(screen.getByRole('button', { name: 'Export wallet data' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Import wallet backup' })).toBeDisabled()
    expect(
      screen.getByText(/Wallet export and import are not available in near-zero security mode/i),
    ).toBeInTheDocument()
  })

  it('disables Change app password when there are no wallets', () => {
    mockWalletsState.data = []
    renderWithProviders(<SettingsSecurityPage />)
    expect(screen.getByRole('button', { name: 'Change app password' })).toBeDisabled()
  })

  it('enables Change app password when at least one wallet exists', () => {
    mockWalletsState.data = [
      { wallet_id: 1, name: 'Test', created_at: new Date().toISOString() },
    ]
    renderWithProviders(<SettingsSecurityPage />)
    expect(screen.getByRole('button', { name: 'Change app password' })).toBeEnabled()
  })

  it('mentions lab data scope in Data Backups card', () => {
    renderWithProviders(<SettingsSecurityPage />)
    expect(
      screen.getByText(/Lab data is tied to wallets on this device/i),
    ).toBeInTheDocument()
  })

  it('shows Set a real password when near-zero security mode is active', () => {
    nearZeroSecurityState.active = true
    mockWalletsState.data = []
    renderWithProviders(<SettingsSecurityPage />)
    expect(screen.getByRole('button', { name: 'Set a real password' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Change app password' })).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-security-card')).toHaveClass('border-destructive')
  })

  it('does not highlight security card when near-zero security mode is inactive', () => {
    nearZeroSecurityState.active = false
    mockWalletsState.data = []
    renderWithProviders(<SettingsSecurityPage />)
    expect(screen.getByTestId('settings-security-card')).not.toHaveClass('border-destructive')
  })

  it('shows complete data wipe card with destructive border', () => {
    renderWithProviders(<SettingsSecurityPage />)
    const card = screen.getByTestId('complete-data-wipe-card')
    expect(card).toHaveClass('border-destructive')
  })

  it('keeps Delete all app data enabled in near-zero mode when there are no wallets', () => {
    nearZeroSecurityState.active = true
    mockWalletsState.data = []
    renderWithProviders(<SettingsSecurityPage />)
    expect(screen.getByRole('button', { name: 'Delete all app data' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Export wallet data' })).toBeDisabled()
  })

  it('disables Delete all app data when wallets exist but the wallet is locked', () => {
    mockWalletsState.data = [
      { wallet_id: 1, name: 'Test', created_at: new Date().toISOString() },
    ]
    walletStoreState.walletStatus = 'locked'
    renderWithProviders(<SettingsSecurityPage />)
    expect(screen.getByRole('button', { name: 'Delete all app data' })).toBeDisabled()
  })
  })

  describe('SettingsFeaturesPage', () => {
  it('opens Mainnet access confirmation modal when enabling the toggle', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsFeaturesPage />)

    await user.click(screen.getByRole('switch', { name: 'Enable Mainnet access' }))

    expect(
      screen.getByRole('heading', { name: 'Mainnet access', level: 2 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Activate access' }),
    ).toBeDisabled()
  })

  it('enables Activate access after acknowledging risks', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsFeaturesPage />)

    await user.click(screen.getByRole('switch', { name: 'Enable Mainnet access' }))
    await user.click(
      screen.getByRole('checkbox', {
        name: /I understand the risks and have a seed phrase backup ready/,
      }),
    )

    const activate = screen.getByRole('button', { name: 'Activate access' })
    await expect(activate).toBeEnabled()
    await user.click(activate)

    expect(featureStoreState.setMainnetAccessEnabled).toHaveBeenCalledWith(true)
  })
  })

  describe('SettingsAboutPage', () => {
  it('shows About, legal hub, and privacy policy link', () => {
    renderWithProviders(<SettingsAboutPage />)
    expect(screen.getByRole('heading', { name: 'About', level: 2 })).toBeInTheDocument()
    expect(document.getElementById('legal-notice')).toBeTruthy()
    const privacyPolicyLink = screen.getByRole('link', { name: /privacy policy/i })
    expect(privacyPolicyLink).toHaveAttribute('href', '/privacy')
    const changelogLink = screen.getByRole('link', { name: 'Changelog' })
    expect(changelogLink).toHaveAttribute('href', GITHUB_CHANGELOG_URL)
  })

  it('shows Developer Contact Info card', () => {
    renderWithProviders(<SettingsAboutPage />)
    const devContactHeading = screen.getByText('Developer Contact Info')
    expect(devContactHeading).toBeInTheDocument()
    const devContactCard = devContactHeading.closest('[data-slot="card"]')
    expect(devContactCard).toBeTruthy()
    expect(within(devContactCard as HTMLElement).getByText('Michael Hrenka')).toBeInTheDocument()
    expect(
      within(devContactCard as HTMLElement).getByRole('link', {
        name: 'michael.hrenka@protonmail.com',
      }),
    ).toBeInTheDocument()
  })
  })
})
