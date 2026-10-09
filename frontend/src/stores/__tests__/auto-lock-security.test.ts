import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  terminateCryptoWorkerMock,
  resetSecretsChannelMock,
  endWalletSecretsSessionReliablyMock,
  getArkadeWorkerIfExistsMock,
  closeArkadeSessionMock,
  closeBarkSessionMock,
} = vi.hoisted(() => ({
  terminateCryptoWorkerMock: vi.fn(),
  resetSecretsChannelMock: vi.fn(),
  endWalletSecretsSessionReliablyMock: vi.fn().mockResolvedValue(undefined),
  getArkadeWorkerIfExistsMock: vi.fn().mockReturnValue(null),
  closeArkadeSessionMock: vi.fn().mockResolvedValue(undefined),
  closeBarkSessionMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/workers/crypto-factory', () => {
  const mockWorker = {
    ping: async () => true,
  }
  return {
    getCryptoWorker: () => mockWorker,
    terminateCryptoWorker: terminateCryptoWorkerMock,
    onWorkerHealthChange: (
      listener: (status: string, error: string | null) => void,
    ) => {
      listener('healthy', null)
      return () => {}
    },
  }
})

vi.mock('@/workers/secrets-channel', () => ({
  resetSecretsChannel: resetSecretsChannelMock,
  resetArkadeWorkerSecretsChannel: vi.fn(),
  resetBarkWorkerSecretsChannel: vi.fn(),
}))

vi.mock('@/lib/wallet/wallet-secrets-session', () => ({
  beginWalletSecretsSession: vi.fn().mockResolvedValue(undefined),
  endWalletSecretsSessionReliably: endWalletSecretsSessionReliablyMock,
  isWalletSecretsSessionActive: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  closeArkadeSession: closeArkadeSessionMock,
}))

vi.mock('@/lib/bark/bark-session-service', () => ({
  closeBarkSession: closeBarkSessionMock,
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorkerIfExists: getArkadeWorkerIfExistsMock,
}))

const purgeLightningConnectionsFromMemoryMock = vi.fn()

const removeOnchainDashboardQueriesMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/wallet/onchain-dashboard-sync', () => ({
  removeOnchainDashboardQueries: removeOnchainDashboardQueriesMock,
}))

vi.mock('@/stores/lightningStore', () => ({
  useLightningStore: {
    getState: () => ({
      purgeLightningConnectionsFromMemory: purgeLightningConnectionsFromMemoryMock,
    }),
  },
}))

vi.mock('@/stores/walletStore', () => {
  type WalletStatus = 'none' | 'locked' | 'unlocked' | 'syncing'
  const walletState = {
    walletStatus: 'none' as WalletStatus,
    lockWallet() {
      walletState.walletStatus = 'locked'
    },
  }

  return {
    useWalletStore: {
      getState: () => walletState,
      setState: (partial: Partial<typeof walletState>) => {
        Object.assign(walletState, partial)
      },
    },
  }
})

import { useCryptoStore } from '../cryptoStore'
import {
  bumpAutoLockTimer,
  clearAutoLockTimer,
  startAutoLockTimer,
} from '../sessionStore'
import { useNearZeroSecurityStore } from '../nearZeroSecurityStore'
import { useWalletStore } from '../walletStore'

describe('auto-lock security purge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    closeArkadeSessionMock.mockReset().mockResolvedValue(undefined)
    closeBarkSessionMock.mockReset().mockResolvedValue(undefined)
    vi.useFakeTimers()
    clearAutoLockTimer()
    useNearZeroSecurityStore.setState({ active: false })
    useWalletStore.setState({
      walletStatus: 'unlocked',
      balance: null,
      currentAddress: null,
      lastSyncTime: null,
      transactions: [],
    })
    const { terminateWorker } = useCryptoStore.getState()
    terminateWorker()
  })

  afterEach(() => {
    clearAutoLockTimer()
    vi.useRealTimers()
  })

  it('auto-lock callback purges worker, secrets channel, and encryption session', async () => {
    startAutoLockTimer(() =>
      useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState(),
    )

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(useWalletStore.getState().walletStatus).toBe('locked')
    expect(endWalletSecretsSessionReliablyMock).toHaveBeenCalledTimes(1)
    expect(resetSecretsChannelMock).toHaveBeenCalledTimes(1)
    expect(terminateCryptoWorkerMock).toHaveBeenCalled()
    expect(useCryptoStore.getState()._worker).toBeNull()
    expect(purgeLightningConnectionsFromMemoryMock).toHaveBeenCalledTimes(1)
    expect(removeOnchainDashboardQueriesMock).toHaveBeenCalledTimes(1)
  })

  it('bumpAutoLockTimer extends idle window so lock does not fire until 15min after last bump', async () => {
    startAutoLockTimer(() =>
      useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState(),
    )

    await vi.advanceTimersByTimeAsync(14 * 60 * 1000)
    expect(endWalletSecretsSessionReliablyMock).not.toHaveBeenCalled()

    bumpAutoLockTimer()
    await vi.advanceTimersByTimeAsync(14 * 60 * 1000)
    expect(endWalletSecretsSessionReliablyMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1 * 60 * 1000)
    expect(endWalletSecretsSessionReliablyMock).toHaveBeenCalledTimes(1)
    expect(useWalletStore.getState().walletStatus).toBe('locked')
  })

  it('bumpAutoLockTimer is a no-op after clearAutoLockTimer', async () => {
    startAutoLockTimer(() =>
      useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState(),
    )
    clearAutoLockTimer()

    bumpAutoLockTimer()
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(endWalletSecretsSessionReliablyMock).not.toHaveBeenCalled()
  })

  it('still locks and purges when Arkade flush throws', async () => {
    const flushSdkPersistenceMock = vi
      .fn()
      .mockRejectedValue(new Error('Arkade SDK persistence flush was skipped (no active session)'))
    getArkadeWorkerIfExistsMock.mockReturnValue({
      flushSdkPersistence: flushSdkPersistenceMock,
    })

    startAutoLockTimer(() =>
      useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState(),
    )

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(flushSdkPersistenceMock).toHaveBeenCalledTimes(1)
    expect(useWalletStore.getState().walletStatus).toBe('locked')
    expect(endWalletSecretsSessionReliablyMock).toHaveBeenCalledTimes(1)
    expect(resetSecretsChannelMock).toHaveBeenCalledTimes(1)
    expect(terminateCryptoWorkerMock).toHaveBeenCalled()
  })

  it('startAutoLockTimer does not fire while near-zero security is active', async () => {
    useNearZeroSecurityStore.setState({ active: true })
    const onLock = vi.fn()
    startAutoLockTimer(onLock)

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(onLock).not.toHaveBeenCalled()
    expect(useWalletStore.getState().walletStatus).toBe('unlocked')
  })

  it('startAutoLockTimer still fires when near-zero security is inactive', async () => {
    const onLock = vi.fn()
    startAutoLockTimer(onLock)

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(onLock).toHaveBeenCalledTimes(1)
  })

  it('startAutoLockTimer can arm after near-zero is turned off', async () => {
    useNearZeroSecurityStore.setState({ active: true })
    const onLock = vi.fn()
    startAutoLockTimer(onLock)
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
    expect(onLock).not.toHaveBeenCalled()

    useNearZeroSecurityStore.setState({ active: false })
    startAutoLockTimer(onLock)
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
    expect(onLock).toHaveBeenCalledTimes(1)
  })

  it('armed auto-lock is disarmed when near-zero security becomes active', async () => {
    const onLock = vi.fn()
    startAutoLockTimer(onLock)

    useNearZeroSecurityStore.setState({ active: true })

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(onLock).not.toHaveBeenCalled()
    expect(useWalletStore.getState().walletStatus).toBe('unlocked')
  })

  it('closes Arkade and Bark sessions in parallel before running later cleanup steps', async () => {
    let arkadeActive = false
    let barkActive = false
    let ranInParallel = false
    let cleanedUpWhileClosing = false

    closeArkadeSessionMock.mockImplementation(async () => {
      arkadeActive = true
      if (barkActive) ranInParallel = true
      await new Promise((resolve) => setTimeout(resolve, 50))
      arkadeActive = false
    })

    closeBarkSessionMock.mockImplementation(async () => {
      barkActive = true
      if (arkadeActive) ranInParallel = true
      await new Promise((resolve) => setTimeout(resolve, 50))
      barkActive = false
    })

    terminateCryptoWorkerMock.mockImplementation(() => {
      if (arkadeActive || barkActive) {
        cleanedUpWhileClosing = true
      }
    })

    const lockPromise = useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState()
    await vi.advanceTimersByTimeAsync(100)
    await lockPromise

    expect(ranInParallel).toBe(true)
    expect(cleanedUpWhileClosing).toBe(false)
    expect(terminateCryptoWorkerMock).toHaveBeenCalled()
    expect(endWalletSecretsSessionReliablyMock).toHaveBeenCalled()
  })

  it('purges sensitive state and propagates error if Bark session close fails', async () => {
    closeBarkSessionMock.mockRejectedValue(new Error('Bark close failed'))

    await expect(
      useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState(),
    ).rejects.toThrow('Bark close failed')

    expect(terminateCryptoWorkerMock).toHaveBeenCalled()
    expect(endWalletSecretsSessionReliablyMock).toHaveBeenCalled()
    expect(resetSecretsChannelMock).toHaveBeenCalled()
  })

  it('purges sensitive state and aggregates errors if both Arkade and Bark session close fail', async () => {
    const arkadeError = new Error('Arkade close failed')
    const barkError = new Error('Bark close failed')
    closeArkadeSessionMock.mockRejectedValue(arkadeError)
    closeBarkSessionMock.mockRejectedValue(barkError)

    const lockPromise = useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState()
    await expect(lockPromise).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AggregateError &&
        err.errors.includes(arkadeError) &&
        err.errors.includes(barkError)
      )
    })

    expect(terminateCryptoWorkerMock).toHaveBeenCalled()
    expect(endWalletSecretsSessionReliablyMock).toHaveBeenCalled()
    expect(resetSecretsChannelMock).toHaveBeenCalled()
  })

  it('purges sensitive state and propagates error if Arkade session close fails', async () => {
    closeArkadeSessionMock.mockRejectedValue(new Error('Arkade close failed'))

    await expect(
      useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState(),
    ).rejects.toThrow('Arkade close failed')

    expect(terminateCryptoWorkerMock).toHaveBeenCalled()
    expect(endWalletSecretsSessionReliablyMock).toHaveBeenCalled()
    expect(resetSecretsChannelMock).toHaveBeenCalled()
  })
})
