import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/stores/walletStore'

const lockAndPurgeSensitiveRuntimeState = vi.fn()
const orchestrateOnchainLoad = vi.fn()
const awaitOnchainLoadQuiescence = vi.fn()
const orchestrateOnchainPostUnlockSync = vi.fn()
const syncOnchainLoadLifecycleWithLockPhase = vi.fn()
const syncOnchainSyncLifecycleWithLockPhase = vi.fn()
const syncOnchainSaveLifecycleWithLockPhase = vi.fn()
const awaitOnchainSyncQuiescence = vi.fn()
const awaitOnchainSaveQuiescence = vi.fn()
const isOnchainSaveBlockingLock = vi.fn()
const orchestrateArkadeLoad = vi.fn()
const awaitArkadeLoadQuiescence = vi.fn()
const awaitArkadeSyncQuiescence = vi.fn()
const awaitArkadeSaveQuiescence = vi.fn()
const isArkadeSaveBlockingLock = vi.fn()
const syncArkadeLoadLifecycleWithLockPhase = vi.fn()
const syncArkadeSyncLifecycleWithLockPhase = vi.fn()
const syncArkadeSaveLifecycleWithLockPhase = vi.fn()
const orchestrateLightningLoad = vi.fn()
const awaitLightningLoadQuiescence = vi.fn()
const awaitLightningSyncQuiescence = vi.fn()
const awaitLightningSaveQuiescence = vi.fn()
const isLightningSaveBlockingLock = vi.fn()
const syncLightningLoadLifecycleWithLockPhase = vi.fn()
const syncLightningSyncLifecycleWithLockPhase = vi.fn()
const syncLightningSaveLifecycleWithLockPhase = vi.fn()
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
  awaitOnchainLoadQuiescence: (...args: unknown[]) => awaitOnchainLoadQuiescence(...args),
  syncOnchainLoadLifecycleWithLockPhase: (...args: unknown[]) =>
    syncOnchainLoadLifecycleWithLockPhase(...args),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  orchestrateArkadeLoad: (...args: unknown[]) => orchestrateArkadeLoad(...args),
  awaitArkadeLoadQuiescence: (...args: unknown[]) => awaitArkadeLoadQuiescence(...args),
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

vi.mock('@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator', () => ({
  orchestrateLightningLoad: (...args: unknown[]) => orchestrateLightningLoad(...args),
  awaitLightningLoadQuiescence: (...args: unknown[]) => awaitLightningLoadQuiescence(...args),
  syncLightningLoadLifecycleWithLockPhase: (...args: unknown[]) =>
    syncLightningLoadLifecycleWithLockPhase(...args),
}))

vi.mock('@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator', () => ({
  awaitLightningSyncQuiescence: (...args: unknown[]) => awaitLightningSyncQuiescence(...args),
  syncLightningSyncLifecycleWithLockPhase: (...args: unknown[]) =>
    syncLightningSyncLifecycleWithLockPhase(...args),
}))

vi.mock('@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator', () => ({
  awaitLightningSaveQuiescence: (...args: unknown[]) => awaitLightningSaveQuiescence(...args),
  isLightningSaveBlockingLock: (...args: unknown[]) => isLightningSaveBlockingLock(...args),
  syncLightningSaveLifecycleWithLockPhase: (...args: unknown[]) =>
    syncLightningSaveLifecycleWithLockPhase(...args),
  LightningSaveBlockingLockError: class LightningSaveBlockingLockError extends Error {
    constructor() {
      super('Lightning save-error blocks lock until retry or forced lock')
      this.name = 'LightningSaveBlockingLockError'
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

vi.mock('@/lib/shared/app-query-client', () => ({
  appQueryClient: {
    cancelQueries: vi.fn().mockResolvedValue(undefined),
    removeQueries: vi.fn(),
  },
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
  syncLockLifecycleFromWalletStore,
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
    orchestrateOnchainLoad.mockImplementation(async () => {
      walletStoreState.walletStatus = 'unlocked'
    })
    orchestrateOnchainPostUnlockSync.mockResolvedValue(undefined)
    awaitOnchainLoadQuiescence.mockResolvedValue(undefined)
    awaitArkadeLoadQuiescence.mockResolvedValue(undefined)
    awaitLightningLoadQuiescence.mockResolvedValue(undefined)
    awaitOnchainSyncQuiescence.mockResolvedValue(undefined)
    awaitOnchainSaveQuiescence.mockResolvedValue(undefined)
    isOnchainSaveBlockingLock.mockReturnValue(false)
    isArkadeSaveBlockingLock.mockReturnValue(false)
    isLightningSaveBlockingLock.mockReturnValue(false)
    awaitArkadeSyncQuiescence.mockResolvedValue(undefined)
    awaitArkadeSaveQuiescence.mockResolvedValue(undefined)
    awaitLightningSyncQuiescence.mockResolvedValue(undefined)
    awaitLightningSaveQuiescence.mockResolvedValue(undefined)
    orchestrateArkadeLoad.mockResolvedValue(undefined)
    orchestrateLightningLoad.mockResolvedValue(undefined)
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
          releaseLoad = () => {
            walletStoreState.walletStatus = 'unlocked'
            resolve()
          }
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
      walletStoreState.walletStatus = 'unlocked'
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

  it('orchestrateManualUnlock fails when on-chain load completes without unlocking wallet', async () => {
    walletStoreState.activeWalletId = 1
    walletStoreState.walletStatus = 'locked'
    syncLockLifecycleWithActiveWallet(1)
    orchestrateOnchainLoad.mockResolvedValue(undefined)

    await expect(
      orchestrateManualUnlock({
        ...unlockParams,
        password: 'secret',
      }),
    ).rejects.toThrow('Wallet unlock did not complete')

    expect(endWalletSecretsSession).toHaveBeenCalledTimes(1)
    expect(walletStoreState.walletStatus).toBe('locked')
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
      allowRetryFromError: true,
    })
    expect(orchestrateOnchainPostUnlockSync).toHaveBeenCalled()
    expect(orchestrateArkadeLoad).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'testnet',
      allowRetryFromError: true,
    })
    expect(orchestrateLightningLoad).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'testnet',
      allowRetryFromError: true,
    })
  })

  it('orchestrateBootstrapUnlock no-ops when wallet is already unlocked', async () => {
    walletStoreState.activeWalletId = 1
    walletStoreState.walletStatus = 'unlocked'
    syncLockLifecycleWithActiveWallet(1)
    syncLockLifecycleFromWalletStore()

    await orchestrateBootstrapUnlock(unlockParams)

    expect(walletStoreState.walletStatus).toBe('unlocked')
    expect(getLockLifecycleSnapshot()).toEqual({
      phase: 'unlocked',
      operation: 'none',
    })
    expect(orchestrateOnchainLoad).not.toHaveBeenCalled()
  })

  it('orchestrateLock rejects when Lightning save-error blocks lock', async () => {
    walletStoreState.activeWalletId = 1
    syncLockLifecycleWithActiveWallet(1)
    isLightningSaveBlockingLock.mockReturnValue(true)

    await expect(orchestrateLock()).rejects.toThrow(
      'Lightning save-error blocks lock until retry or forced lock',
    )
    expect(lockAndPurgeSensitiveRuntimeState).not.toHaveBeenCalled()
  })

  it('orchestrateLock awaits Lightning sync and save quiescence', async () => {
    walletStoreState.activeWalletId = 1
    syncLockLifecycleWithActiveWallet(1)

    await orchestrateLock()

    expect(awaitLightningSyncQuiescence).toHaveBeenCalled()
    expect(awaitLightningSaveQuiescence).toHaveBeenCalled()
    expect(syncLightningLoadLifecycleWithLockPhase).toHaveBeenCalledWith('locked')
    expect(syncLightningSyncLifecycleWithLockPhase).toHaveBeenCalledWith('locked')
    expect(syncLightningSaveLifecycleWithLockPhase).toHaveBeenCalledWith('locked')
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

  it('orchestrateLock awaits load quiescence before sync quiescence', async () => {
    walletStoreState.activeWalletId = 1
    syncLockLifecycleWithActiveWallet(1)

    const callOrder: string[] = []
    awaitOnchainLoadQuiescence.mockImplementation(async () => {
      callOrder.push('onchain-load')
    })
    awaitArkadeLoadQuiescence.mockImplementation(async () => {
      callOrder.push('arkade-load')
    })
    awaitLightningLoadQuiescence.mockImplementation(async () => {
      callOrder.push('lightning-load')
    })
    awaitOnchainSyncQuiescence.mockImplementation(async () => {
      callOrder.push('onchain-sync')
    })

    await orchestrateLock()

    expect(callOrder.indexOf('onchain-load')).toBeLessThan(callOrder.indexOf('onchain-sync'))
    expect(callOrder).toEqual([
      'onchain-load',
      'arkade-load',
      'lightning-load',
      'onchain-sync',
    ])
  })

  it('orchestrateLock re-checks save blocking after quiescence', async () => {
    walletStoreState.activeWalletId = 1
    syncLockLifecycleWithActiveWallet(1)

    let arkadeSaveCheckCount = 0
    isArkadeSaveBlockingLock.mockImplementation(() => {
      arkadeSaveCheckCount += 1
      return arkadeSaveCheckCount > 1
    })

    await expect(orchestrateLock()).rejects.toThrow(
      'Arkade save-error blocks lock until retry or forced lock',
    )
    expect(isArkadeSaveBlockingLock).toHaveBeenCalledTimes(2)
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
