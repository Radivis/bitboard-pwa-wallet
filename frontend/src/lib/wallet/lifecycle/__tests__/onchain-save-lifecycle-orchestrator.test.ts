import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/stores/walletStore'

const updateDescriptorWalletChangeset = vi.fn()
const exportChangeset = vi.fn()
const setLastSyncTime = vi.fn()
const invalidateOnchainDashboardQueries = vi.fn()
const invalidateLightningDashboardQueries = vi.fn()

vi.mock('@/lib/wallet/descriptor-wallet-manager', () => ({
  updateDescriptorWalletChangeset: (...args: unknown[]) =>
    updateDescriptorWalletChangeset(...args),
}))

vi.mock('@/lib/wallet/onchain-dashboard-sync', () => ({
  invalidateOnchainDashboardQueries: (...args: unknown[]) =>
    invalidateOnchainDashboardQueries(...args),
}))

vi.mock('@/lib/lightning/lightning-dashboard-sync', () => ({
  invalidateLightningDashboardQueries: (...args: unknown[]) =>
    invalidateLightningDashboardQueries(...args),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-rail-lifecycle-cross-tab-sync', () => ({
  notifyOnchainRailLifecycleChangedFromThisTab: vi.fn(),
}))

const walletStoreState = {
  loadedDescriptorWallet: null as {
    networkMode: 'testnet'
    addressType: AddressType
    accountId: number
  } | null,
  networkMode: 'testnet' as const,
  addressType: AddressType.Taproot,
  accountId: 0,
}

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: {
      getState: () => ({
        ...walletStoreState,
        setLastSyncTime,
      }),
    },
  }
})

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      exportChangeset,
    }),
  },
}))

import {
  acknowledgeOnchainSaveErrorForForcedLock,
  getOnchainSaveLifecycleSnapshot,
  isOnchainSaveBlockingLock,
  orchestrateOnchainRetrySave,
  orchestrateOnchainSave,
  resetOnchainSaveLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'

const saveParams = {
  walletId: 1,
  networkMode: 'testnet' as const,
  addressType: AddressType.Taproot,
  accountId: 0,
  markFullScanDone: true,
}

describe('onchain-save-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetOnchainSaveLifecycleStateForTests()
    vi.clearAllMocks()
    exportChangeset.mockResolvedValue('{}')
    updateDescriptorWalletChangeset.mockResolvedValue(undefined)
    walletStoreState.loadedDescriptorWallet = null
  })

  it('save success transitions saving to not-saving', async () => {
    const phases: string[] = []
    const { subscribeOnchainSaveLifecycle } = await import(
      '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
    )
    subscribeOnchainSaveLifecycle((next) => phases.push(next.savePhase))

    await orchestrateOnchainSave(saveParams)

    expect(phases).toContain('saving')
    expect(getOnchainSaveLifecycleSnapshot()).toEqual({
      savePhase: 'not-saving',
      errorMessage: null,
      descriptorScope: {
        walletId: 1,
        networkMode: 'testnet',
        addressType: AddressType.Taproot,
        accountId: 0,
      },
    })
    expect(updateDescriptorWalletChangeset).toHaveBeenCalled()
    expect(setLastSyncTime).toHaveBeenCalled()
  })

  it('save failure sets save-error', async () => {
    updateDescriptorWalletChangeset.mockRejectedValue(new Error('disk full'))

    await expect(orchestrateOnchainSave(saveParams)).rejects.toThrow('disk full')
    expect(getOnchainSaveLifecycleSnapshot().savePhase).toBe('save-error')
    expect(getOnchainSaveLifecycleSnapshot().errorMessage).toBeTruthy()
  })

  it('orchestrateOnchainRetrySave succeeds after save-error', async () => {
    updateDescriptorWalletChangeset.mockRejectedValueOnce(new Error('disk full'))
    await expect(orchestrateOnchainSave(saveParams)).rejects.toThrow()

    updateDescriptorWalletChangeset.mockResolvedValue(undefined)
    await orchestrateOnchainRetrySave()

    expect(getOnchainSaveLifecycleSnapshot().savePhase).toBe('not-saving')
  })

  it('acknowledgeOnchainSaveErrorForForcedLock clears block', async () => {
    updateDescriptorWalletChangeset.mockRejectedValue(new Error('disk full'))
    await expect(orchestrateOnchainSave(saveParams)).rejects.toThrow()
    expect(isOnchainSaveBlockingLock()).toBe(true)

    acknowledgeOnchainSaveErrorForForcedLock()

    expect(isOnchainSaveBlockingLock()).toBe(false)
    expect(getOnchainSaveLifecycleSnapshot().savePhase).toBe('not-saving')
  })

  it('isOnchainSaveBlockingLock true only on save-error', () => {
    expect(isOnchainSaveBlockingLock()).toBe(false)
  })
})
