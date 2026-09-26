import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SplitWalletSecretsEncryptedBlobs } from '@/db'
import { useWalletStore } from '@/stores/walletStore'

const mockEnsureMigrated = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockGetDatabase = vi.hoisted(() => vi.fn())
const mockPersistNewWalletWithSecrets = vi.hoisted(() => vi.fn())
const mockSetWalletNoMnemonicBackupFlag = vi.hoisted(() => vi.fn())
const mockInvalidateWalletQueries = vi.hoisted(() => vi.fn())
const mockOrchestrateOnchainSetupAfterPersist = vi.hoisted(() => vi.fn())
const mockShowImportInitialSyncFailureToast = vi.hoisted(() => vi.fn())
const mockStartAutoLockTimer = vi.hoisted(() => vi.fn())
const mockEnsureWalletSecretsSession = vi.hoisted(() => vi.fn())
const mockEnsureSecretsChannel = vi.hoisted(() => vi.fn())
const mockReleasePreviousWalletDashboardSession = vi.hoisted(() => vi.fn())
const mockStartArkadeSessionForNewWallet = vi.hoisted(() => vi.fn())

vi.mock('@/db', () => ({
  ensureMigrated: mockEnsureMigrated,
  getDatabase: mockGetDatabase,
  persistNewWalletWithSecrets: mockPersistNewWalletWithSecrets,
  setWalletNoMnemonicBackupFlag: mockSetWalletNoMnemonicBackupFlag,
}))

vi.mock('@/lib/wallet/wallet-query-cache-sync', () => ({
  invalidateWalletRelatedQueriesAndNotifyOtherTabs: mockInvalidateWalletQueries,
}))

vi.mock('@/lib/wallet/lifecycle/onchain-setup-lifecycle', () => ({
  orchestrateOnchainSetupAfterPersist: mockOrchestrateOnchainSetupAfterPersist,
}))

vi.mock('@/lib/wallet/lifecycle/lock-lifecycle-orchestrator', () => ({
  orchestrateLock: vi.fn(),
}))

vi.mock('@/lib/wallet/wallet-sync-error-toast', () => ({
  showImportInitialSyncFailureToast: mockShowImportInitialSyncFailureToast,
}))

vi.mock('@/lib/wallet/wallet-utils', () => ({
  retryImportInitialEsploraSyncWithWalletStatus: vi.fn(),
}))

vi.mock('@/stores/sessionStore', () => ({
  startAutoLockTimer: mockStartAutoLockTimer,
}))

vi.mock('@/lib/wallet/wallet-secrets-session', () => ({
  ensureWalletSecretsSession: mockEnsureWalletSecretsSession,
}))

vi.mock('@/workers/secrets-channel', () => ({
  ensureSecretsChannel: mockEnsureSecretsChannel,
}))

vi.mock('@/lib/wallet/new-wallet-dashboard-session', () => ({
  releasePreviousWalletDashboardSession: (...args: unknown[]) =>
    mockReleasePreviousWalletDashboardSession(...args),
  startArkadeSessionForNewWallet: (...args: unknown[]) =>
    mockStartArkadeSessionForNewWallet(...args),
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: vi.fn(),
  },
}))

import {
  newWalletPersistFieldsFromEncryptResult,
  persistAndActivateNewWallet,
  prepareNewWalletEncryption,
} from '@/lib/wallet/new-wallet'

const walletDb = { kind: 'wallet-db' }

function encryptedBlobs(): SplitWalletSecretsEncryptedBlobs {
  const blob = {
    ciphertext: new Uint8Array(0),
    iv: new Uint8Array(12),
    salt: new Uint8Array(16),
    kdfPhc: '$argon2id$v=19$m=65536,t=2,p=1',
  }
  return { payload: blob, mnemonic: blob }
}

describe('new wallet helpers', () => {
  it('maps encrypt results into persist fields', () => {
    const blobs = encryptedBlobs()
    expect(
      newWalletPersistFieldsFromEncryptResult({
        encryptedPayload: blobs.payload,
        encryptedMnemonic: blobs.mnemonic,
        walletResult: { firstAddress: 'tb1map' },
      }),
    ).toEqual({
      encryptedBlobs: blobs,
      firstAddress: 'tb1map',
    })
  })

  const setBalance = vi.fn()
  const setTransactions = vi.fn()
  const setLastSyncTime = vi.fn()
  const setCurrentAddress = vi.fn()
  const setActiveWallet = vi.fn()
  const commitLoadedDescriptorWallet = vi.fn()
  const setWalletStatus = vi.fn()
  const clearArkadeDashboardState = vi.fn()
  const setImportInitialSyncErrorMessage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureMigrated.mockResolvedValue(undefined)
    mockGetDatabase.mockReturnValue(walletDb)
    mockSetWalletNoMnemonicBackupFlag.mockResolvedValue(undefined)
    mockOrchestrateOnchainSetupAfterPersist.mockResolvedValue(undefined)
    mockEnsureWalletSecretsSession.mockResolvedValue(undefined)
    mockEnsureSecretsChannel.mockResolvedValue(undefined)
    mockPersistNewWalletWithSecrets.mockImplementation(
      async (params: { insertWalletRow: () => Promise<number> }) => params.insertWalletRow(),
    )
    vi.mocked(useWalletStore.getState).mockReturnValue({
      networkMode: 'signet',
      addressType: 'taproot',
      accountId: 0,
      setBalance,
      setTransactions,
      setLastSyncTime,
      setCurrentAddress,
      setActiveWallet,
      commitLoadedDescriptorWallet,
      setWalletStatus,
      clearArkadeDashboardState,
      setImportInitialSyncErrorMessage,
    } as unknown as ReturnType<typeof useWalletStore.getState>)
  })

  it('prepares the secrets session and maps the network for encryption', async () => {
    await expect(prepareNewWalletEncryption('app-password', 'signet')).resolves.toBe('signet')
    expect(mockEnsureWalletSecretsSession).toHaveBeenCalledWith('app-password')
    expect(mockEnsureSecretsChannel).toHaveBeenCalledTimes(1)
  })

  it('inserts the default name, clears stale dashboard state, and skips the no-mnemonic flag', async () => {
    const insertWalletRow = vi.fn().mockResolvedValue(4)
    const queryClient = new QueryClient()

    await expect(
      persistAndActivateNewWallet({
        encryptedBlobs: encryptedBlobs(),
        firstAddress: 'tb1new',
        markNoMnemonicBackup: false,
        existingWalletNames: [],
        insertWalletRow,
        queryClient,
      }),
    ).resolves.toBe(4)

    expect(insertWalletRow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Main Wallet', createdAt: expect.any(String) }),
    )
    expect(mockSetWalletNoMnemonicBackupFlag).not.toHaveBeenCalled()
    expect(mockInvalidateWalletQueries).not.toHaveBeenCalled()
    expect(setBalance).toHaveBeenCalledWith(null)
    expect(setTransactions).toHaveBeenCalledWith([])
    expect(setLastSyncTime).toHaveBeenCalledWith(null)
    expect(setCurrentAddress.mock.calls).toEqual([[null], ['tb1new']])
    expect(mockReleasePreviousWalletDashboardSession).toHaveBeenCalledWith(4)
    expect(setActiveWallet).toHaveBeenCalledWith(4)
    expect(mockStartArkadeSessionForNewWallet).toHaveBeenCalledWith(4, 'signet')
    expect(clearArkadeDashboardState).toHaveBeenCalled()
    expect(setWalletStatus).toHaveBeenCalledWith('unlocked')
    expect(commitLoadedDescriptorWallet).toHaveBeenCalledWith({
      networkMode: 'signet',
      addressType: 'taproot',
      accountId: 0,
    })
    expect(mockStartAutoLockTimer).toHaveBeenCalledTimes(1)
    expect(mockOrchestrateOnchainSetupAfterPersist).toHaveBeenCalledWith({
      walletId: 4,
      networkMode: 'signet',
      addressType: 'taproot',
      accountId: 0,
      onSyncError: expect.any(Function),
    })
    expect(setImportInitialSyncErrorMessage).toHaveBeenCalledWith(null)
  })

  it('sets the no-mnemonic-backup flag only when requested', async () => {
    const insertWalletRow = vi.fn().mockResolvedValue(9)
    const queryClient = new QueryClient()

    await persistAndActivateNewWallet({
      encryptedBlobs: encryptedBlobs(),
      firstAddress: 'tb1skip',
      markNoMnemonicBackup: true,
      existingWalletNames: [],
      insertWalletRow,
      queryClient,
    })

    expect(mockSetWalletNoMnemonicBackupFlag).toHaveBeenCalledWith(walletDb, 9)
    expect(mockInvalidateWalletQueries).toHaveBeenCalledWith(queryClient)
  })

  it('records background sync failure without rejecting', async () => {
    const syncError = new Error('esplora down')
    mockOrchestrateOnchainSetupAfterPersist.mockImplementation(async (params: {
      onSyncError?: (err: unknown) => void
    }) => {
      params.onSyncError?.(syncError)
    })
    const insertWalletRow = vi.fn().mockResolvedValue(3)
    const queryClient = new QueryClient()

    await expect(
      persistAndActivateNewWallet({
        encryptedBlobs: encryptedBlobs(),
        firstAddress: 'tb1sync',
        markNoMnemonicBackup: false,
        existingWalletNames: [],
        insertWalletRow,
        queryClient,
      }),
    ).resolves.toBe(3)

    expect(setImportInitialSyncErrorMessage).toHaveBeenCalledWith('esplora down')
    expect(mockShowImportInitialSyncFailureToast).toHaveBeenCalledWith(
      syncError,
      expect.any(Function),
    )
  })
})
