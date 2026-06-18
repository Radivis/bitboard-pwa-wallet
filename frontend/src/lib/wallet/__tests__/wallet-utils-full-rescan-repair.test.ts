import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/lightning/lightning-dashboard-sync', () => ({
  invalidateLightningDashboardQueries: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    dismiss: vi.fn(),
    error: vi.fn(),
  },
}))

const hoisted = vi.hoisted(() => {
  const fullScanAttempt = { n: 0 }
  const loadWalletMock = vi.fn().mockResolvedValue(true)
  const getCurrentAddressMock = vi.fn().mockResolvedValue('bc1qrepair')
  const getBalanceMock = vi.fn().mockResolvedValue({
    confirmedSats: 0,
    trustedPendingSats: 0,
    untrustedPendingSats: 0,
    immatureSats: 0,
    totalSats: 0,
  })
  const getTransactionListMock = vi.fn().mockResolvedValue([])
  const exportChangesetMock = vi.fn().mockResolvedValue('{}')
  const syncWalletMock = vi.fn()
  const fullScanWalletMock = vi.fn()
  return {
    fullScanAttempt,
    loadWalletMock,
    getCurrentAddressMock,
    getBalanceMock,
    getTransactionListMock,
    exportChangesetMock,
    syncWalletMock,
    fullScanWalletMock,
    resetFullScanAttempts: () => {
      fullScanAttempt.n = 0
    },
  }
})

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      syncWallet: hoisted.syncWalletMock,
      fullScanWallet: hoisted.fullScanWalletMock,
      getBalance: hoisted.getBalanceMock,
      getTransactionList: hoisted.getTransactionListMock,
      exportChangeset: hoisted.exportChangesetMock,
      loadWallet: hoisted.loadWalletMock,
      getCurrentAddress: hoisted.getCurrentAddressMock,
    }),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      loadedDescriptorWallet: null,
      networkMode: 'mainnet',
      addressType: 'wpkh',
      accountId: 0,
      setLastSyncTime: vi.fn(),
      setBalance: vi.fn(),
      setTransactions: vi.fn(),
      setCurrentAddress: vi.fn(),
    }),
  },
}))

vi.mock('@/lib/wallet/descriptor-wallet-manager', () => ({
  resolveDescriptorWallet: vi.fn().mockResolvedValue({
    network: 'bitcoin',
    addressType: 'wpkh',
    accountId: 0,
    externalDescriptor: 'external',
    internalDescriptor: 'internal',
    changeSet: '{"x":1}',
    fullScanDone: true,
  }),
  updateDescriptorWalletChangeset: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db/database', () => ({
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
  getDatabase: vi.fn(() => ({
    selectFrom: vi.fn(() => ({
      select: vi.fn(() => ({
        where: vi.fn(() => ({
          executeTakeFirst: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    })),
  })),
}))

import {
  reloadActiveLoadedDescriptorWalletWithEmptyChain,
  runFullScanDashboardWalletSync,
} from '@/lib/wallet/wallet-utils'

describe('runFullScanDashboardWalletSync repair path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.resetFullScanAttempts()
    hoisted.fullScanWalletMock.mockImplementation(async () => {
      hoisted.fullScanAttempt.n += 1
      if (hoisted.fullScanAttempt.n === 1) {
        throw new Error(
          'Blockchain error: HeaderHashNotFound(BlockHash(000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f))',
        )
      }
      return { changesetJson: '{}', balance: {} }
    })
  })

  it('reloads wallet with empty chain once when full scan hits header hash mismatch', async () => {
    await runFullScanDashboardWalletSync({
      networkMode: 'mainnet',
      activeWalletId: 1,
    })

    expect(hoisted.fullScanWalletMock).toHaveBeenCalledTimes(2)
    expect(hoisted.loadWalletMock).toHaveBeenCalledTimes(1)
    expect(hoisted.loadWalletMock).toHaveBeenCalledWith({
      externalDescriptor: 'external',
      internalDescriptor: 'internal',
      network: 'bitcoin',
      changesetJson: '{"x":1}',
      useEmptyChain: true,
    })
    expect(hoisted.getCurrentAddressMock).toHaveBeenCalled()
  })

  it('does not reload when full scan succeeds on first attempt', async () => {
    hoisted.fullScanWalletMock.mockResolvedValue({
      changesetJson: '{}',
      balance: {},
    })
    await runFullScanDashboardWalletSync({
      networkMode: 'mainnet',
      activeWalletId: 1,
    })

    expect(hoisted.fullScanWalletMock).toHaveBeenCalledTimes(1)
    expect(hoisted.loadWalletMock).not.toHaveBeenCalled()
  })

  it('repairs without requiring password param', async () => {
    await expect(
      runFullScanDashboardWalletSync({
        networkMode: 'mainnet',
        activeWalletId: 1,
      }),
    ).resolves.toBeUndefined()

    expect(hoisted.loadWalletMock).toHaveBeenCalledTimes(1)
  })
})

describe('reloadActiveLoadedDescriptorWalletWithEmptyChain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls loadWallet with useEmptyChain true', async () => {
    await reloadActiveLoadedDescriptorWalletWithEmptyChain({
      walletId: 2,
      networkMode: 'mainnet',
      addressType: 'wpkh',
      accountId: 0,
    })

    expect(hoisted.loadWalletMock).toHaveBeenCalledWith(
      expect.objectContaining({ useEmptyChain: true }),
    )
  })
})
