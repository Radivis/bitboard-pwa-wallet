import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWalletStore, AddressType } from '@/stores/walletStore'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import {
  ensureWalletUnlockedForAction,
  isWalletReadyForSecretsAccess,
  runWhenWalletUnlocked,
  WalletUnlockRequiredError,
} from '@/lib/wallet/require-unlocked-wallet'

const tryLoadNearZeroSessionIntoMemory = vi.fn()
const orchestrateBootstrapUnlock = vi.fn()
const walletSecretsSessionActive = vi.fn()
const endWalletSecretsSession = vi.fn()

vi.mock('@/db', () => ({
  getDatabase: () => ({}),
  tryLoadNearZeroSessionIntoMemory: (...args: unknown[]) =>
    tryLoadNearZeroSessionIntoMemory(...args),
}))

vi.mock('@/lib/wallet/wallet-secrets-session', () => ({
  isWalletSecretsSessionActive: () => walletSecretsSessionActive(),
  endWalletSecretsSession: (...args: unknown[]) => endWalletSecretsSession(...args),
}))

vi.mock('@/lib/wallet/lifecycle/lock-lifecycle-orchestrator', () => ({
  orchestrateBootstrapUnlock: (...args: unknown[]) => orchestrateBootstrapUnlock(...args),
}))

vi.mock('@/lib/wallet/wallet-sync-error-toast', () => ({
  reportWalletSyncError: vi.fn(),
}))

describe('require-unlocked-wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNearZeroSecurityStore.setState({ active: false })
    useWalletStore.setState({
      activeWalletId: 1,
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      walletStatus: 'locked',
    })
    tryLoadNearZeroSessionIntoMemory.mockResolvedValue(true)
    orchestrateBootstrapUnlock.mockResolvedValue(undefined)
    walletSecretsSessionActive.mockResolvedValue(false)
    endWalletSecretsSession.mockResolvedValue(undefined)
  })

  it('isWalletReadyForSecretsAccess is true when unlocked', () => {
    useWalletStore.setState({ walletStatus: 'unlocked' })
    expect(isWalletReadyForSecretsAccess()).toBe(true)
  })

  it('ensureWalletUnlockedForAction returns immediately when unlocked', async () => {
    useWalletStore.setState({ walletStatus: 'unlocked' })
    await expect(ensureWalletUnlockedForAction()).resolves.toBeUndefined()
    expect(orchestrateBootstrapUnlock).not.toHaveBeenCalled()
  })

  it('ensureWalletUnlockedForAction throws when password unlock is required', async () => {
    tryLoadNearZeroSessionIntoMemory.mockResolvedValue(false)
    await expect(ensureWalletUnlockedForAction()).rejects.toBeInstanceOf(
      WalletUnlockRequiredError,
    )
  })

  it('ensureWalletUnlockedForAction restores near-zero session and bootstraps', async () => {
    useNearZeroSecurityStore.setState({ active: true })
    walletSecretsSessionActive.mockResolvedValue(true)
    orchestrateBootstrapUnlock.mockImplementation(async () => {
      useWalletStore.setState({ walletStatus: 'unlocked' })
    })

    await ensureWalletUnlockedForAction()

    expect(tryLoadNearZeroSessionIntoMemory).toHaveBeenCalledTimes(1)
    expect(orchestrateBootstrapUnlock).toHaveBeenCalledTimes(1)
  })

  it('ensureWalletUnlockedForAction restores near-zero from the database when the in-memory flag is stale', async () => {
    useNearZeroSecurityStore.setState({ active: false })
    walletSecretsSessionActive.mockResolvedValue(true)
    orchestrateBootstrapUnlock.mockImplementation(async () => {
      useWalletStore.setState({ walletStatus: 'unlocked' })
    })

    await ensureWalletUnlockedForAction()

    expect(tryLoadNearZeroSessionIntoMemory).toHaveBeenCalledTimes(1)
    expect(orchestrateBootstrapUnlock).toHaveBeenCalledTimes(1)
  })

  it('ensureWalletUnlockedForAction ends the secrets session when bootstrap throws after restore', async () => {
    walletSecretsSessionActive.mockResolvedValue(true)
    orchestrateBootstrapUnlock.mockRejectedValue(new Error('descriptor wallet decrypt failed'))

    await expect(ensureWalletUnlockedForAction()).rejects.toBeInstanceOf(
      WalletUnlockRequiredError,
    )
    expect(endWalletSecretsSession).toHaveBeenCalledTimes(1)
  })

  it('runWhenWalletUnlocked runs action when already unlocked', async () => {
    useWalletStore.setState({ walletStatus: 'unlocked' })
    const action = vi.fn()
    await runWhenWalletUnlocked(action)
    expect(action).toHaveBeenCalledTimes(1)
  })
})
