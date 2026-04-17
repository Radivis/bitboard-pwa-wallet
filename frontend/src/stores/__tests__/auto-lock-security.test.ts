import { beforeEach, describe, expect, it, vi } from 'vitest'

const { terminateCryptoWorkerMock, resetSecretsChannelMock } = vi.hoisted(
  () => ({
    terminateCryptoWorkerMock: vi.fn(),
    resetSecretsChannelMock: vi.fn(),
  }),
)

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
}))

const purgeLightningConnectionsFromMemoryMock = vi.fn()

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
  useSessionStore,
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
    useSessionStore.setState({ password: 'test-password' })
    const { terminateWorker } = useCryptoStore.getState()
    terminateWorker()
  })

  it('auto-lock callback purges worker, secrets channel, and session password', async () => {
    startAutoLockTimer(() =>
      useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState(),
    )

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(useSessionStore.getState().password).toBeNull()
    expect(useWalletStore.getState().walletStatus).toBe('locked')
    expect(resetSecretsChannelMock).toHaveBeenCalledTimes(1)
    expect(terminateCryptoWorkerMock).toHaveBeenCalled()
    expect(useCryptoStore.getState()._worker).toBeNull()
    expect(purgeLightningConnectionsFromMemoryMock).toHaveBeenCalledTimes(1)
  })

  it('bumpAutoLockTimer extends idle window so lock does not fire until 15min after last bump', async () => {
    startAutoLockTimer(() =>
      useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState(),
    )

    await vi.advanceTimersByTimeAsync(14 * 60 * 1000)
    expect(useSessionStore.getState().password).toBe('test-password')

    bumpAutoLockTimer()
    await vi.advanceTimersByTimeAsync(14 * 60 * 1000)
    expect(useSessionStore.getState().password).toBe('test-password')

    await vi.advanceTimersByTimeAsync(1 * 60 * 1000)
    expect(useSessionStore.getState().password).toBeNull()
    expect(useWalletStore.getState().walletStatus).toBe('locked')
  })

  it('bumpAutoLockTimer is a no-op after clearAutoLockTimer', async () => {
    startAutoLockTimer(() =>
      useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState(),
    )
    clearAutoLockTimer()

    bumpAutoLockTimer()
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    expect(useSessionStore.getState().password).toBe('test-password')
  })
})
