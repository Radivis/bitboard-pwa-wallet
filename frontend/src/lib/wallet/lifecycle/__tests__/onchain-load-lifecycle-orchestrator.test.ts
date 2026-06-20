import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/stores/walletStore'

const waitForCryptoWorkerHealthy = vi.fn()
const resolveDescriptorWallet = vi.fn()
const withPersistedChainMismatchRetry = vi.fn()
const refreshWalletStoreFromLoadedBdk = vi.fn()
const invalidateOnchainDashboardQueries = vi.fn()
const openArkadeSessionForWallet = vi.fn()
const isArkadeActiveForNetworkMode = vi.fn()
const startAutoLockTimer = vi.fn()

const loadWallet = vi.fn()
const getCurrentAddress = vi.fn()
const setWalletStatus = vi.fn()
const setBalance = vi.fn()
const setTransactions = vi.fn()
const setCurrentAddress = vi.fn()
const setLastSyncTime = vi.fn()
const commitLoadedDescriptorWallet = vi.fn()

vi.mock('@/workers/crypto-factory', () => ({
  waitForCryptoWorkerHealthy: (...args: unknown[]) => waitForCryptoWorkerHealthy(...args),
}))

vi.mock('@/lib/wallet/descriptor-wallet-manager', () => ({
  resolveDescriptorWallet: (...args: unknown[]) => resolveDescriptorWallet(...args),
}))

vi.mock('@/lib/wallet/persisted-chain-mismatch', () => ({
  withPersistedChainMismatchRetry: (...args: unknown[]) =>
    withPersistedChainMismatchRetry(...args),
}))

vi.mock('@/lib/wallet/onchain-bdk-store-sync', () => ({
  refreshWalletStoreFromLoadedBdk: (...args: unknown[]) =>
    refreshWalletStoreFromLoadedBdk(...args),
}))

vi.mock('@/lib/wallet/onchain-dashboard-sync', () => ({
  invalidateOnchainDashboardQueries: (...args: unknown[]) =>
    invalidateOnchainDashboardQueries(...args),
}))

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  openArkadeSessionForWallet: (...args: unknown[]) => openArkadeSessionForWallet(...args),
}))

vi.mock('@/lib/arkade/arkade-utils', () => ({
  isArkadeActiveForNetworkMode: (...args: unknown[]) =>
    isArkadeActiveForNetworkMode(...args),
}))

vi.mock('@/lib/arkade/arkade-session-open-error-toast', () => ({
  reportArkadeSessionOpenError: vi.fn(),
}))

vi.mock('@/stores/sessionStore', () => ({
  startAutoLockTimer: (...args: unknown[]) => startAutoLockTimer(...args),
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      loadWallet,
      getCurrentAddress,
    }),
  },
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: {
      getState: () => ({
        setWalletStatus,
        setBalance,
        setTransactions,
        setCurrentAddress,
        setLastSyncTime,
        commitLoadedDescriptorWallet,
      }),
    },
  }
})

vi.mock('@/lib/wallet/lifecycle/onchain-rail-lifecycle-cross-tab-sync', () => ({
  notifyOnchainRailLifecycleChangedFromThisTab: vi.fn(),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', () => ({
  configureOnchainSyncForLoadedRail: vi.fn(),
  getOnchainSyncLifecycleSnapshot: () => ({
    syncPhase: 'not-configured',
    descriptorScope: null,
  }),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator', () => ({
  getOnchainSaveLifecycleSnapshot: () => ({
    savePhase: 'not-configured',
    errorMessage: null,
    descriptorScope: null,
  }),
}))

import {
  applyOnchainLoadLifecycleSnapshotFromOtherTab,
  getOnchainLoadLifecycleSnapshot,
  orchestrateOnchainLoad,
  resetOnchainLoadLifecycleStateForTests,
  subscribeOnchainLoadLifecycle,
  syncOnchainLoadLifecycleWithLockPhase,
} from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import { getOnchainRailSnapshot } from '@/lib/wallet/lifecycle/onchain-rail-snapshot'

const loadParams = {
  walletId: 1,
  networkMode: 'testnet' as const,
  addressType: AddressType.Taproot,
  accountId: 0,
  clearLastSyncTime: true,
}

describe('onchain-load-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetOnchainLoadLifecycleStateForTests()
    vi.clearAllMocks()
    waitForCryptoWorkerHealthy.mockResolvedValue(undefined)
    resolveDescriptorWallet.mockResolvedValue({
      externalDescriptor: 'ext',
      internalDescriptor: 'int',
      changeSet: '{}',
    })
    withPersistedChainMismatchRetry.mockImplementation(async (operation, params) => {
      await operation(params)
      return { result: true, usedEmptyChainFallback: false }
    })
    getCurrentAddress.mockResolvedValue('tb1qtest')
    refreshWalletStoreFromLoadedBdk.mockResolvedValue(undefined)
    isArkadeActiveForNetworkMode.mockReturnValue(false)
    startAutoLockTimer.mockReturnValue(undefined)
  })

  it('initial snapshot is all not-configured', () => {
    expect(getOnchainLoadLifecycleSnapshot()).toEqual({
      loadPhase: 'not-configured',
      networkMode: null,
    })
    expect(getOnchainRailSnapshot()).toEqual({
      loadPhase: 'not-configured',
      syncPhase: 'not-configured',
      savePhase: 'not-configured',
    })
  })

  it('orchestrateOnchainLoad transitions loading to loaded', async () => {
    const phases: string[] = []
    subscribeOnchainLoadLifecycle((next) => phases.push(next.loadPhase))

    await orchestrateOnchainLoad(loadParams)

    expect(phases).toContain('loading')
    expect(getOnchainLoadLifecycleSnapshot()).toEqual({
      loadPhase: 'loaded',
      networkMode: 'testnet',
    })
  })

  it('loaded implies commitLoadedDescriptorWallet and refreshWalletStoreFromLoadedBdk called', async () => {
    await orchestrateOnchainLoad(loadParams)

    expect(commitLoadedDescriptorWallet).toHaveBeenCalledWith({
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
    })
    expect(refreshWalletStoreFromLoadedBdk).toHaveBeenCalled()
    expect(invalidateOnchainDashboardQueries).toHaveBeenCalled()
    expect(setWalletStatus).toHaveBeenCalledWith('unlocked')
    expect(setLastSyncTime).toHaveBeenCalledWith(null)
    expect(startAutoLockTimer).toHaveBeenCalled()
  })

  it('load failure sets load-error and rethrows', async () => {
    withPersistedChainMismatchRetry.mockRejectedValue(new Error('wasm load failed'))

    await expect(orchestrateOnchainLoad(loadParams)).rejects.toThrow('wasm load failed')
    expect(getOnchainLoadLifecycleSnapshot().loadPhase).toBe('load-error')
  })

  it('duplicate orchestrateOnchainLoad coalesces to one in-flight promise', async () => {
    let resolveLoad!: () => void
    const loadGate = new Promise<void>((resolve) => {
      resolveLoad = resolve
    })
    withPersistedChainMismatchRetry.mockImplementation(() => loadGate)

    const first = orchestrateOnchainLoad(loadParams)
    const second = orchestrateOnchainLoad(loadParams)

    expect(getOnchainLoadLifecycleSnapshot().loadPhase).toBe('loading')
    resolveLoad()
    await Promise.all([first, second])

    expect(withPersistedChainMismatchRetry).toHaveBeenCalledTimes(1)
    expect(getOnchainLoadLifecycleSnapshot().loadPhase).toBe('loaded')
  })

  it('syncOnchainLoadLifecycleWithLockPhase resets to not-configured', async () => {
    await orchestrateOnchainLoad(loadParams)
    syncOnchainLoadLifecycleWithLockPhase('locked')
    expect(getOnchainLoadLifecycleSnapshot()).toEqual({
      loadPhase: 'not-configured',
      networkMode: null,
    })
  })

  it('lab network syncPhase stays not-configured when configured', async () => {
    await orchestrateOnchainLoad({
      ...loadParams,
      networkMode: 'lab',
      clearLastSyncTime: false,
    })

    expect(getOnchainRailSnapshot()).toEqual({
      loadPhase: 'loaded',
      syncPhase: 'not-configured',
      savePhase: 'not-saving',
    })
    expect(refreshWalletStoreFromLoadedBdk).not.toHaveBeenCalled()
    expect(setLastSyncTime).not.toHaveBeenCalled()
  })

  it('cross-tab apply updates snapshot without calling load', () => {
    applyOnchainLoadLifecycleSnapshotFromOtherTab({
      loadPhase: 'loaded',
      networkMode: 'mainnet',
    })

    expect(getOnchainLoadLifecycleSnapshot()).toEqual({
      loadPhase: 'loaded',
      networkMode: 'mainnet',
    })
    expect(waitForCryptoWorkerHealthy).not.toHaveBeenCalled()
    expect(resolveDescriptorWallet).not.toHaveBeenCalled()
  })
})
