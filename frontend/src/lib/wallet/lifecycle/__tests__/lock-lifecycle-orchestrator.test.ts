import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/stores/walletStore'

const lockAndPurgeSensitiveRuntimeState = vi.fn()
const orchestrateOnchainLoad = vi.fn()
const schedulePostUnlockEsploraSync = vi.fn()
const syncOnchainLoadLifecycleWithLockPhase = vi.fn()
const getArkadeSessionOpenPromiseFromLastOnchainLoad = vi.fn()
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
  getArkadeSessionOpenPromiseFromLastOnchainLoad: () =>
    getArkadeSessionOpenPromiseFromLastOnchainLoad(),
  syncOnchainLoadLifecycleWithLockPhase: (...args: unknown[]) =>
    syncOnchainLoadLifecycleWithLockPhase(...args),
}))

vi.mock('@/lib/wallet/wallet-utils', () => ({
  schedulePostUnlockEsploraSync: (...args: unknown[]) =>
    schedulePostUnlockEsploraSync(...args),
}))

vi.mock('@/lib/wallet/wallet-secrets-session', () => ({
  ensureWalletSecretsSession: (...args: unknown[]) => ensureWalletSecretsSession(...args),
  endWalletSecretsSession: (...args: unknown[]) => endWalletSecretsSession(...args),
  isWalletSecretsSessionActive: (...args: unknown[]) => isWalletSecretsSessionActive(...args),
}))

vi.mock('@/workers/crypto-factory', () => ({
  waitForCryptoWorkerHealthy: vi.fn().mockResolvedValue(undefined),
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
    schedulePostUnlockEsploraSync.mockResolvedValue(undefined)
    getArkadeSessionOpenPromiseFromLastOnchainLoad.mockReturnValue(null)
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
    expect(schedulePostUnlockEsploraSync).toHaveBeenCalledTimes(1)
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
    expect(schedulePostUnlockEsploraSync).toHaveBeenCalled()
  })
})
