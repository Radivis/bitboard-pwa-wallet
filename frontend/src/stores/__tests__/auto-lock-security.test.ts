import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  terminateCryptoWorkerMock,
  resetSecretsChannelMock,
  endWalletSecretsSessionReliablyMock,
} = vi.hoisted(() => ({
  terminateCryptoWorkerMock: vi.fn(),
  resetSecretsChannelMock: vi.fn(),
  endWalletSecretsSessionReliablyMock: vi.fn().mockResolvedValue(undefined),
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
}))

vi.mock('@/lib/wallet/wallet-secrets-session', () => ({
  beginWalletSecretsSession: vi.fn().mockResolvedValue(undefined),
  endWalletSecretsSessionReliably: endWalletSecretsSessionReliablyMock,
  isWalletSecretsSessionActive: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/arkade/arkade-operator-sync', () => ({
  awaitBackgroundArkadeOperatorSync: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  closeArkadeSession: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorkerIfExists: vi.fn().mockReturnValue(null),
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
import { useWalletStore } from '../walletStore'

describe('auto-lock security purge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    clearAutoLockTimer()
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
})
