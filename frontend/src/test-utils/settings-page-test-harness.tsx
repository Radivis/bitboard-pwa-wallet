/**
 * Settings route test mocks. Import this module before `@/pages/settings/*` in route tests
 * so `vi.mock` registrations run before the page under test is loaded.
 */
import type { ReactNode } from 'react'
import { vi } from 'vitest'

/** Mutable feature flags for settings page tests. */
export const featureStoreState = {
  lightningEnabled: false,
  mainnetAccessEnabled: false,
  regtestModeEnabled: false,
  segwitAddressesEnabled: false,
  setLightningEnabled: vi.fn(),
  setMainnetAccessEnabled: vi.fn(),
  setRegtestModeEnabled: vi.fn(),
  setSegwitAddressesEnabled: vi.fn(),
}

export const mockTerminateWorker = vi.fn()
export const mockExportChangeset = vi.fn().mockRejectedValue(
  new Error('No active wallet. Call create_wallet or load_wallet first.'),
)
export const mockLoadWallet = vi.fn().mockResolvedValue(true)
export const mockSyncWallet = vi.fn().mockResolvedValue({ balance: {}, changesetJson: '{}' })
export const mockGetBalance = vi.fn().mockResolvedValue({ confirmed: 0, total: 0 })
export const mockGetTransactionList = vi.fn().mockResolvedValue([])
export const mockGetCurrentAddress = vi.fn().mockResolvedValue('tb1qcurrent')
export const mockLockWallet = vi.fn()
export const mockClearSession = vi.fn()

export const cryptoStoreState = {
  get terminateWorker() {
    return mockTerminateWorker
  },
  get exportChangeset() {
    return mockExportChangeset
  },
  get loadWallet() {
    return mockLoadWallet
  },
  get syncWallet() {
    return mockSyncWallet
  },
  get getBalance() {
    return mockGetBalance
  },
  get getTransactionList() {
    return mockGetTransactionList
  },
  get getCurrentAddress() {
    return mockGetCurrentAddress
  },
  lockAndPurgeSensitiveRuntimeState: async () => {
    mockLockWallet()
    mockTerminateWorker()
    mockClearSession()
  },
}

export let walletStoreState: Record<string, unknown> = {}
export const mockSetNetworkMode = vi.fn()
export const mockSetAddressType = vi.fn()
export const mockSetCurrentAddress = vi.fn()
export const mockCommitLoadedSubWallet = vi.fn()

export const mockSetSessionPassword = vi.fn()
export const sessionStoreState = {
  password: 'testpass' as string | null,
  clear: mockClearSession,
  setPassword: mockSetSessionPassword,
}

export const nearZeroSecurityState = { active: false }

export const mockSetThemeMode = vi.fn()

export const mockWalletsState: {
  data: { wallet_id: number; name: string; created_at: string }[]
} = {
  data: [],
}

export const mockLoadWalletSecretsPayload = vi.fn().mockResolvedValue({
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
})

export const mockLoadDescriptorWalletAndSync = vi.fn().mockResolvedValue(undefined)
export const mockLoadDescriptorWalletWithoutSync = vi.fn().mockResolvedValue(undefined)

export const mockResolveDescriptorWallet = vi.fn().mockResolvedValue({
  network: 'signet',
  addressType: 'taproot',
  accountId: 0,
  externalDescriptor: 'ext',
  internalDescriptor: 'int',
  changeSet: '{}',
  fullScanDone: false,
})
export const mockUpdateDescriptorWalletChangeset = vi.fn().mockResolvedValue(undefined)

/** Mocked sonner toast — import this in settings tests instead of `sonner` directly. */
export const toast = {
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}

vi.mock('sonner', () => ({
  toast,
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (s: typeof featureStoreState) => unknown) =>
      selector(featureStoreState),
    { getState: () => featureStoreState },
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
      children: ReactNode
      to: string
      className?: string
    }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
  }
})

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector(cryptoStoreState),
    { getState: () => cryptoStoreState },
  ),
}))

vi.mock('@/stores/walletStore', async () => {
  const { AddressType } = await import('@/lib/wallet/wallet-domain-types')
  return {
    AddressType,
    useWalletStore: Object.assign(
      (selector: (s: Record<string, unknown>) => unknown) =>
        selector(walletStoreState),
      { getState: () => walletStoreState },
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
      const walletState = walletStoreState as {
        loadedSubWallet: { networkMode: string } | null
        networkMode: string
      }
      return walletState.loadedSubWallet?.networkMode ?? walletState.networkMode
    },
    selectCommittedAccountId: (s: {
      loadedSubWallet: { accountId: number } | null
      accountId: number
    }) => s.loadedSubWallet?.accountId ?? s.accountId,
  }
})

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector(sessionStoreState),
    { getState: () => sessionStoreState },
  ),
  clearAutoLockTimer: vi.fn(),
}))

vi.mock('@/stores/nearZeroSecurityStore', () => ({
  useNearZeroSecurityStore: (selector: (s: typeof nearZeroSecurityState) => unknown) =>
    selector(nearZeroSecurityState),
}))

vi.mock('@/db/opfs/opfs-root-file', () => ({
  opfsRootFileExists: vi.fn().mockResolvedValue(false),
  readBlobFromOpfsRootIfExists: vi.fn(),
  readTextFileFromOpfsRootIfExists: vi.fn(),
  triggerBrowserSaveLocalBlob: vi.fn(),
}))

vi.mock('@/lib/esplora/mainnet-onchain-balance-probe', () => ({
  listWalletsWithPositiveMainnetOnChainBalance: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/db/opfs/wipe-all-app-data-opfs-and-reload', () => ({
  wipeAllAppDataOpfsAndReload: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db/wallet-no-mnemonic-backup', () => ({
  anyWalletHasNoMnemonicBackupFlag: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ themeMode: 'system', setThemeMode: mockSetThemeMode }),
}))

vi.mock('@/db', () => ({
  getDatabase: vi.fn(),
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
  loadWalletSecrets: vi.fn().mockRejectedValue(new Error('Wrong password')),
  loadWalletSecretsPayload: mockLoadWalletSecretsPayload,
  useWallets: () => ({ data: mockWalletsState.data }),
}))

vi.mock('@/lib/wallet/bitcoin-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wallet/bitcoin-utils')>()
  return {
    ...actual,
    getEsploraUrl: () => 'http://localhost:3002',
  }
})

vi.mock('@/lib/wallet/wallet-utils', () => ({
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
      return { usedEmptyChainFallback: false }
    },
  ),
}))

vi.mock('@/lib/wallet/descriptor-wallet-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wallet/descriptor-wallet-manager')>()
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

vi.mock('@/hooks/useFiatProviderSupportedCurrenciesQuery', () => ({
  useFiatProviderSupportedCurrenciesQuery: () => ({
    data: {
      codes: ['EUR', 'GBP', 'USD'],
      krakenPairByCode: {
        EUR: 'XXBTZEUR',
        GBP: 'XXBTZGBP',
        USD: 'XXBTZUSD',
      },
    },
    isPending: false,
    isError: false,
    isSuccess: true,
  }),
}))

function wireFeatureStoreMockImplementations(): void {
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
}

wireFeatureStoreMockImplementations()

/** Default unlocked signet wallet state for settings page tests. */
export function createDefaultWalletStoreState(): Record<string, unknown> {
  return {
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
    setLastSyncTime: vi.fn(),
    lockWallet: mockLockWallet,
  }
}

/** Reset mutable harness state between tests. */
export function resetSettingsPageTestState(): void {
  vi.clearAllMocks()
  wireFeatureStoreMockImplementations()
  mockExportChangeset.mockRejectedValue(
    new Error('No active wallet. Call create_wallet or load_wallet first.'),
  )
  mockLoadWalletSecretsPayload.mockResolvedValue({
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
  })
  mockResolveDescriptorWallet.mockResolvedValue({
    network: 'signet',
    addressType: 'taproot',
    accountId: 0,
    externalDescriptor: 'ext',
    internalDescriptor: 'int',
    changeSet: '{}',
    fullScanDone: false,
  })
  mockUpdateDescriptorWalletChangeset.mockResolvedValue(undefined)
  mockLoadDescriptorWalletAndSync.mockResolvedValue(undefined)
  mockLoadDescriptorWalletWithoutSync.mockResolvedValue(undefined)
  featureStoreState.lightningEnabled = false
  featureStoreState.mainnetAccessEnabled = false
  featureStoreState.regtestModeEnabled = false
  featureStoreState.segwitAddressesEnabled = false
  nearZeroSecurityState.active = false
  mockWalletsState.data = []
  sessionStoreState.password = 'testpass'
  walletStoreState = createDefaultWalletStoreState()
}

walletStoreState = createDefaultWalletStoreState()
