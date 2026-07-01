import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const orchestrateOnchainSyncThenSave = vi.fn()

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', () => ({
  orchestrateOnchainSyncThenSave: (...args: unknown[]) =>
    orchestrateOnchainSyncThenSave(...args),
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      syncWallet: vi.fn(),
      fullScanWallet: vi.fn(),
      getBalance: vi.fn(),
      getTransactionList: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      addressType: 'wpkh',
      accountId: 0,
    }),
  },
}))

vi.mock('@/lib/wallet/onchain-dashboard-sync', () => ({
  invalidateOnchainDashboardQueries: vi.fn(),
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

import { runIncrementalDashboardWalletSync } from '@/lib/wallet/wallet-utils'

describe('runIncrementalDashboardWalletSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orchestrateOnchainSyncThenSave.mockResolvedValue(undefined)
  })

  it('uses incremental Esplora sync on regtest (not full scan)', async () => {
    await runIncrementalDashboardWalletSync({
      networkMode: 'regtest',
      activeWalletId: 1,
    })

    expect(orchestrateOnchainSyncThenSave).toHaveBeenCalledWith(
      expect.objectContaining({
        networkMode: 'regtest',
        syncKind: 'incrementalDashboard',
        useFullScan: false,
        markFullScanDone: false,
      }),
    )
  })

  it('uses incremental Esplora sync on testnet', async () => {
    await runIncrementalDashboardWalletSync({
      networkMode: 'testnet',
      activeWalletId: 1,
    })

    expect(orchestrateOnchainSyncThenSave).toHaveBeenCalledWith(
      expect.objectContaining({
        networkMode: 'testnet',
        useFullScan: false,
      }),
    )
  })
})
