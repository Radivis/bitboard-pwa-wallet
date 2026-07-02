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

vi.mock('@/db', () => ({
  getDatabase: () => ({}),
  tryLoadNearZeroSessionIntoMemory: (...args: unknown[]) =>
    tryLoadNearZeroSessionIntoMemory(...args),
}))

vi.mock('@/lib/wallet/wallet-secrets-session', () => ({
  isWalletSecretsSessionActive: () => walletSecretsSessionActive(),
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

  it('runWhenWalletUnlocked runs action when already unlocked', async () => {
    useWalletStore.setState({ walletStatus: 'unlocked' })
    const action = vi.fn()
    await runWhenWalletUnlocked(action)
    expect(action).toHaveBeenCalledTimes(1)
  })
})
