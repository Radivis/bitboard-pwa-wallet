import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/lib/wallet/wallet-domain-types'

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}))

vi.mock('@/db/database', () => ({
  ensureMigrated: vi.fn(async () => undefined),
  getDatabase: vi.fn(() => ({
    selectFrom: vi.fn(() => ({
      select: vi.fn(() => ({
        where: vi.fn(() => ({
          executeTakeFirst: vi.fn(async () => null),
        })),
      })),
    })),
  })),
}))

const syncWallet = vi.fn()
const refreshWalletStoreFromLoadedBdk = vi.fn()

vi.mock('@/lib/wallet/onchain-bdk-store-sync', () => ({
  refreshWalletStoreFromLoadedBdk: (...args: unknown[]) =>
    refreshWalletStoreFromLoadedBdk(...args),
}))

vi.mock('@/lib/wallet/onchain-esplora-sync-metadata', () => ({}))

vi.mock('@/lib/lightning/lightning-dashboard-sync', () => ({
  invalidateLightningDashboardQueries: vi.fn(),
}))

vi.mock('@/lib/wallet/onchain-dashboard-sync', () => ({
  invalidateOnchainDashboardQueries: vi.fn(),
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      syncWallet,
      fullScanWallet: vi.fn(),
      exportChangeset: vi.fn(async () => '{}'),
      getBalance: vi.fn(async () => ({
        confirmedSats: 900,
        trustedPendingSats: 0,
        untrustedPendingSats: 0,
        immatureSats: 0,
        totalSats: 900,
      })),
      getTransactionList: vi.fn(async () => [
        {
          txid: 'saved',
          sentSats: 0,
          receivedSats: 900,
          feeSats: null,
          confirmationBlockHeight: 1,
          confirmationTime: 1,
          isConfirmed: true,
          isLabTx: false,
        },
      ]),
    }),
  },
}))

vi.mock('@/lib/wallet/descriptor-wallet-manager', () => ({
  updateDescriptorWalletChangeset: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
  },
}))

import { useWalletStore } from '@/stores/walletStore'
import { updateDescriptorWalletChangeset } from '@/lib/wallet/descriptor-wallet-manager'
import { syncLoadedDescriptorWalletWithEsplora } from '@/lib/wallet/wallet-utils'

describe('syncLoadedDescriptorWalletWithEsplora BDK fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refreshWalletStoreFromLoadedBdk.mockResolvedValue(undefined)
    useWalletStore.setState({
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      balance: {
        confirmedSats: 900,
        trustedPendingSats: 0,
        untrustedPendingSats: 0,
        immatureSats: 0,
        totalSats: 900,
      },
      transactions: [
        {
          txid: 'saved',
          sentSats: 0,
          receivedSats: 900,
          feeSats: null,
          confirmationBlockHeight: 1,
          confirmationTime: 1,
          isConfirmed: true,
          isLabTx: false,
        },
      ],
      loadedDescriptorWallet: {
        networkMode: 'testnet',
        addressType: AddressType.Taproot,
        accountId: 0,
      },
    })
    syncWallet.mockRejectedValue(new Error('Esplora down'))
  })

  it('refreshes BDK store data when Esplora sync fails', async () => {
    const result = await syncLoadedDescriptorWalletWithEsplora({
      networkMode: 'testnet',
      activeWalletId: 1,
      sessionPassword: 'pw',
      targetNetwork: 'testnet',
      targetAddressType: AddressType.Taproot,
      targetAccountId: 0,
      fullScanNeeded: false,
    })

    expect(result).toBe('syncFailed')
    expect(refreshWalletStoreFromLoadedBdk).toHaveBeenCalled()
  })

  it('persists changeset and timestamp on incremental sync success', async () => {
    syncWallet.mockResolvedValue(undefined)

    const result = await syncLoadedDescriptorWalletWithEsplora({
      networkMode: 'testnet',
      activeWalletId: 1,
      sessionPassword: 'pw',
      targetNetwork: 'testnet',
      targetAddressType: AddressType.Taproot,
      targetAccountId: 0,
      fullScanNeeded: false,
    })

    expect(result).toBe('completed')
    expect(updateDescriptorWalletChangeset).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'pw',
        walletId: 1,
        network: 'testnet',
        addressType: AddressType.Taproot,
        accountId: 0,
        changesetJson: '{}',
        markFullScanDone: false,
        lastSuccessfulEsploraSyncAt: expect.any(String),
      }),
    )
  })
})
