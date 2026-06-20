import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/stores/walletStore'

const lockAndPurgeSensitiveRuntimeState = vi.fn()
const orchestrateOnchainLoad = vi.fn()
const orchestrateOnchainPostUnlockSync = vi.fn()
const syncOnchainLoadLifecycleWithLockPhase = vi.fn()
const syncOnchainSyncLifecycleWithLockPhase = vi.fn()
const syncOnchainSaveLifecycleWithLockPhase = vi.fn()
const awaitOnchainSyncQuiescence = vi.fn()
const awaitOnchainSaveQuiescence = vi.fn()
const isOnchainSaveBlockingLock = vi.fn()
const orchestrateArkadeLoad = vi.fn()
const awaitArkadeSyncQuiescence = vi.fn()
const awaitArkadeSaveQuiescence = vi.fn()
const isArkadeSaveBlockingLock = vi.fn()
const syncArkadeLoadLifecycleWithLockPhase = vi.fn()
const syncArkadeSyncLifecycleWithLockPhase = vi.fn()
const syncArkadeSaveLifecycleWithLockPhase = vi.fn()
const awaitInFlightWalletSecretsWrites = vi.fn()
const ensureWalletSecretsSession = vi.fn()
const endWalletSecretsSession = vi.fn()
const isWalletSecretsSessionActive = vi.fn()

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      lockAndPurgeSensitiveRuntimeState,
    }),
  },
}))

vi.mock('@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator', () => ({
  orchestrateOnchainLoad: (...args: unknown[]) => orchestrateOnchainLoad(...args),
  syncOnchainLoadLifecycleWithLockPhase: (...args: unknown[]) =>
    syncOnchainLoadLifecycleWithLockPhase(...args),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  orchestrateArkadeLoad: (...args: unknown[]) => orchestrateArkadeLoad(...args),
  syncArkadeLoadLifecycleWithLockPhase: (...args: unknown[]) =>
    syncArkadeLoadLifecycleWithLockPhase(...args),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator', () => ({
  awaitArkadeSyncQuiescence: (...args: unknown[]) => awaitArkadeSyncQuiescence(...args),
  syncArkadeSyncLifecycleWithLockPhase: (...args: unknown[]) =>
    syncArkadeSyncLifecycleWithLockPhase(...args),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator', () => ({
  awaitArkadeSaveQuiescence: (...args: unknown[]) => awaitArkadeSaveQuiescence(...args),
  isArkadeSaveBlockingLock: (...args: unknown[]) => isArkadeSaveBlockingLock(...args),
  syncArkadeSaveLifecycleWithLockPhase: (...args: unknown[]) =>
    syncArkadeSaveLifecycleWithLockPhase(...args),
  ArkadeSaveBlockingLockError: class ArkadeSaveBlockingLockError extends Error {
    constructor() {
      super('Arkade save-error blocks lock until retry or forced lock')
      this.name = 'ArkadeSaveBlockingLockError'
    }
  },
}))

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', () => ({
  orchestrateOnchainPostUnlockSync: (...args: unknown[]) =>
    orchestrateOnchainPostUnlockSync(...args),
  awaitOnchainSyncQuiescence: (...args: unknown[]) => awaitOnchainSyncQuiescence(...args),
  syncOnchainSyncLifecycleWithLockPhase: (...args: unknown[]) =>
    syncOnchainSyncLifecycleWithLockPhase(...args),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator', () => ({
  awaitOnchainSaveQuiescence: (...args: unknown[]) => awaitOnchainSaveQuiescence(...args),
  isOnchainSaveBlockingLock: (...args: unknown[]) => isOnchainSaveBlockingLock(...args),
  syncOnchainSaveLifecycleWithLockPhase: (...args: unknown[]) =>
    syncOnchainSaveLifecycleWithLockPhase(...args),
  OnchainSaveBlockingLockError: class OnchainSaveBlockingLockError extends Error {
    constructor() {
      super('On-chain save-error blocks lock until retry or forced lock')
      this.name = 'OnchainSaveBlockingLockError'
    }
  },
}))

vi.mock('@/db/wallet-secrets-write-tracker', () => ({
  awaitInFlightWalletSecretsWrites: (...args: unknown[]) =>
    awaitInFlightWalletSecretsWrites(...args),
}))

vi.mock('@/lib/wallet/wallet-secrets-session', () => ({
  ensureWalletSecretsSession: (...args: unknown[]) => ensureWalletSecretsSession(...args),
  endWalletSecretsSession: (...args: unknown[]) => endWalletSecretsSession(...args),
  isWalletSecretsSessionActive: (...args: unknown[]) => isWalletSecretsSessionActive(...args),
}))

vi.mock('@/workers/crypto-factory', () => ({
  waitForCryptoWorkerHealthy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/arkade/arkade-utils', () => ({
  isArkadeActiveForNetworkMode: () => true,
}))

const walletStoreState = {
  activeWalletId: null as number | null,
  walletStatus: 'none' as 'none' | 'locked' | 'unlocked' | 'syncing',
}

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: {
      getState: () => walletStoreState,
    },
  }
})

import {
  canStartBootstrapUnlock,
  getLockLifecycleSnapshot,
  orchestrateBootstrapUnlock,
  orchestrateLock,
  orchestrateManualUnlock,
  resetLockLifecycleStateForTests,
  syncLockLifecycleWithActiveWallet,
} from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'

const unlockParams = {
  walletId: 1,
  networkMode: 'testnet' as const,
  addressType: AddressType.Taproot,
  accountId: 0,
}

describe('lock-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetLockLifecycleStateForTests()
    walletStoreState.activeWalletId = null
    walletStoreState.walletStatus = 'none'
    vi.clearAllMocks()
    lockAndPurgeSensitiveRuntimeState.mockResolvedValue(undefined)
    orchestrateOnchainLoad.mockResolvedValue(undefined)
    orchestrateOnchainPostUnlockSync.mockResolvedValue(undefined)
    awaitOnchainSyncQuiescence.mockResolvedValue(undefined)
    awaitOnchainSaveQuiescence.mockResolvedValue(undefined)
    isOnchainSaveBlockingLock.mockReturnValue(false)
    isArkadeSaveBlockingLock.mockReturnValue(false)
    awaitArkadeSyncQuiescence.mockResolvedValue(undefined)
    awaitArkadeSaveQuiescence.mockResolvedValue(undefined)
    orchestrateArkadeLoad.mockResolvedValue(undefined)
    awaitInFlightWalletSecretsWrites.mockResolvedValue(undefined)
    ensureWalletSecretsSession.mockResolvedValue(undefined)
    endWalletSecretsSession.mockResolvedValue(undefined)
    isWalletSecretsSessionActive.mockResolvedValue(true)
  })

  it('initial state is no-lock with operation none', () => {
    expect(getLockLifecycleSnapshot()).toEqual({
      phase: 'no-lock',
      operation: 'none',
    })
  })

  it('syncLockLifecycleWithActiveWallet sets locked from no-lock', () => {
    syncLockLifecycleWithActiveWallet(1)
    expect(getLockLifecycleSnapshot().phase).toBe('locked')
  })

  it('syncLockLifecycleWithActiveWallet sets no-lock when wallet id cleared', () => {
    syncLockLifecycleWithActiveWallet(1)
    syncLockLifecycleWithActiveWallet(null)
    expect(getLockLifecycleSnapshot()).toEqual({
      phase: 'no-lock',
      operation: 'none',
    })
  })

  it('canStartBootstrapUnlock false during manual_unlock', async () => {
    walletStoreState.activeWalletId = 1
    walletStoreState.walletStatus = 'locked'
    syncLockLifecycleWithActiveWallet(1)

    let releaseLoad: (() => void) | undefined
    orchestrateOnchainLoad.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseLoad = resolve
        }),
    )

    const unlockPromise = orchestrateManualUnlock({
      ...unlockParams,
      password: 'secret',
    })

    await vi.waitFor(() => {
      expect(canStartBootstrapUnlock()).toBe(false)
    })

    releaseLoad?.()
    await unlockPromise
  })

  it('canStartBootstrapUnlock false in no-lock phase', () => {
    expect(canStartBootstrapUnlock()).toBe(false)
  })

  it('orchestrateBootstrapUnlock coalesces duplicate calls', async () => {
    walletStoreState.activeWalletId = 1
    walletStoreState.walletStatus = 'locked'
    syncLockLifecycleWithActiveWallet(1)

    let resolveLoad: (() => void) | undefined
    orchestrateOnchainLoad.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve
        }),
    )

    const first = orchestrateBootstrapUnlock(unlockParams)
    const second = orchestrateBootstrapUnlock(unlockParams)

    await vi.waitFor(() => {
      expect(orchestrateOnchainLoad).toHaveBeenCalledTimes(1)
    })
    resolveLoad?.()
    await Promise.all([first, second])

    expect(orchestrateOnchainLoad).toHaveBeenCalledTimes(1)
    expect(orchestrateOnchainPostUnlockSync).toHaveBeenCalledTimes(1)
  })

  it('orchestrateLock waits for in-flight unlock', async () => {
    walletStoreState.activeWalletId = 1
    walletStoreState.walletStatus = 'locked'
    syncLockLifecycleWithActiveWallet(1)

    const callOrder: string[] = []
    let releaseSecrets: (() => void) | undefined
    ensureWalletSecretsSession.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseSecrets = () => {
            callOrder.push('secrets-released')
            resolve()
          }
        }),
    )
    orchestrateOnchainLoad.mockImplementation(async () => {
      callOrder.push('unlock-load')
    })
    lockAndPurgeSensitiveRuntimeState.mockImplementation(async () => {
      callOrder.push('lock')
    })

    const unlockPromise = orchestrateManualUnlock({
      ...unlockParams,
      password: 'secret',
    })
    await vi.waitFor(() => {
      expect(getLockLifecycleSnapshot().operation).toBe('manual_unlock')
    })

    const lockPromise = orchestrateLock()
    releaseSecrets?.()
    await unlockPromise
    await lockPromise

    expect(callOrder).toEqual(['secrets-released', 'unlock-load', 'lock'])
    expect(syncOnchainLoadLifecycleWithLockPhase).toHaveBeenCalledWith('locked')
    expect(syncOnchainSyncLifecycleWithLockPhase).toHaveBeenCalledWith('locked')
    expect(syncOnchainSaveLifecycleWithLockPhase).toHaveBeenCalledWith('locked')
    expect(syncArkadeLoadLifecycleWithLockPhase).toHaveBeenCalledWith('locked')
    expect(syncArkadeSyncLifecycleWithLockPhase).toHaveBeenCalledWith('locked')
    expect(syncArkadeSaveLifecycleWithLockPhase).toHaveBeenCalledWith('locked')
  })

  it('orchestrateLock no-op in no-lock phase', async () => {
    await orchestrateLock()
    expect(lockAndPurgeSensitiveRuntimeState).not.toHaveBeenCalled()
    expect(getLockLifecycleSnapshot().phase).toBe('no-lock')
  })

  it('orchestrateManualUnlock failure reverts to locked and ends session', async () => {
    walletStoreState.activeWalletId = 1
    syncLockLifecycleWithActiveWallet(1)
    orchestrateOnchainLoad.mockRejectedValue(new Error('load failed'))

    await expect(
      orchestrateManualUnlock({
        ...unlockParams,
        password: 'secret',
      }),
    ).rejects.toThrow('load failed')

    expect(endWalletSecretsSession).toHaveBeenCalledTimes(1)
    expect(getLockLifecycleSnapshot()).toEqual({
      phase: 'locked',
      operation: 'none',
    })
  })

  it('orchestrateManualUnlock success sets unlocked', async () => {
    walletStoreState.activeWalletId = 1
    syncLockLifecycleWithActiveWallet(1)

    await orchestrateManualUnlock({
      ...unlockParams,
      password: 'secret',
    })

    expect(getLockLifecycleSnapshot()).toEqual({
      phase: 'unlocked',
      operation: 'none',
    })
    expect(orchestrateOnchainLoad).toHaveBeenCalledWith({
      ...unlockParams,
      clearLastSyncTime: true,
    })
    expect(orchestrateOnchainPostUnlockSync).toHaveBeenCalled()
    expect(orchestrateArkadeLoad).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'testnet',
    })
  })

  it('orchestrateLock rejects when Arkade save-error blocks lock', async () => {
    walletStoreState.activeWalletId = 1
    syncLockLifecycleWithActiveWallet(1)
    isArkadeSaveBlockingLock.mockReturnValue(true)

    await expect(orchestrateLock()).rejects.toThrow(
      'Arkade save-error blocks lock until retry or forced lock',
    )
    expect(lockAndPurgeSensitiveRuntimeState).not.toHaveBeenCalled()
  })

  it('orchestrateLock rejects when on-chain save-error blocks lock', async () => {
    walletStoreState.activeWalletId = 1
    syncLockLifecycleWithActiveWallet(1)
    isOnchainSaveBlockingLock.mockReturnValue(true)

    await expect(orchestrateLock()).rejects.toThrow(
      'On-chain save-error blocks lock until retry or forced lock',
    )
    expect(lockAndPurgeSensitiveRuntimeState).not.toHaveBeenCalled()
  })
})
