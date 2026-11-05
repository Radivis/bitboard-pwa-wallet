import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/stores/walletStore'

const awaitOnchainSyncQuiescence = vi.fn(
  () => new Promise<void>(() => {}),
)
const loadDescriptorWalletWithoutSync = vi.fn().mockResolvedValue(undefined)
const updateDescriptorWalletChangeset = vi.fn().mockResolvedValue(undefined)
const exportChangeset = vi.fn().mockResolvedValue('{"local":"changeset"}')

vi.mock('@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator', () => ({
  awaitOnchainLoadQuiescence: vi.fn().mockResolvedValue(undefined),
  getOnchainLoadLifecycleSnapshot: () => ({
    loadPhase: 'loaded',
    networkMode: 'testnet',
    errorMessage: null,
  }),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator', () => ({
  awaitOnchainSaveQuiescence: vi.fn().mockResolvedValue(undefined),
  getOnchainSaveLifecycleSnapshot: () => ({
    savePhase: 'not-saving',
    descriptorScope: null,
    errorMessage: null,
  }),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', () => ({
  awaitOnchainSyncQuiescence: () => awaitOnchainSyncQuiescence(),
  getOnchainSyncLifecycleSnapshot: () => ({
    syncPhase: 'syncing',
    descriptorScope: {
      walletId: 7,
      networkMode: 'testnet',
      addressType: 'taproot',
      accountId: 0,
    },
    errorMessage: null,
  }),
}))

vi.mock('@/lib/wallet/wallet-utils', () => ({
  ONCHAIN_BLOCKCHAIN_SCAN_TOAST_ID: 'onchain-blockchain-scan',
  loadDescriptorWalletWithoutSync: (...args: unknown[]) =>
    loadDescriptorWalletWithoutSync(...args),
}))

vi.mock('@/lib/wallet/descriptor-wallet-manager', () => ({
  updateDescriptorWalletChangeset: (...args: unknown[]) =>
    updateDescriptorWalletChangeset(...args),
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      exportChangeset,
    }),
  },
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: {
      getState: () => ({
        walletStatus: 'unlocked',
        activeWalletId: 7,
        networkMode: 'testnet',
        addressType: actual.AddressType.Taproot,
        accountId: 0,
        setNetworkMode: vi.fn(),
      }),
    },
  }
})

vi.mock('@/workers/lab-factory', () => ({
  terminateLabWorker: vi.fn(),
}))

vi.mock('@/hooks/useLabChainStateQuery', () => ({
  prefetchLabChainState: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('sonner', () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
  },
}))

import { switchToLabNetwork } from '@/lib/lab/switch-to-lab-network'

describe('switchToLabNetwork', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exportChangeset.mockResolvedValue('{"local":"changeset"}')
    loadDescriptorWalletWithoutSync.mockResolvedValue(undefined)
    updateDescriptorWalletChangeset.mockResolvedValue(undefined)
  })

  it('loads lab while an Esplora scan is still in progress', async () => {
    const switchPromise = switchToLabNetwork({
      previousNetworkMode: 'testnet',
      walletStatus: 'unlocked',
      addressType: AddressType.Taproot,
      accountId: 0,
    })

    await expect(
      Promise.race([
        switchPromise.then(() => 'loaded'),
        new Promise((resolve) => {
          setTimeout(() => resolve('blocked'), 300)
        }),
      ]),
    ).resolves.toBe('loaded')

    expect(awaitOnchainSyncQuiescence).not.toHaveBeenCalled()
    expect(exportChangeset).toHaveBeenCalled()
    expect(loadDescriptorWalletWithoutSync).toHaveBeenCalledWith(
      expect.objectContaining({ walletId: 7, networkMode: 'lab' }),
    )
  })
})
