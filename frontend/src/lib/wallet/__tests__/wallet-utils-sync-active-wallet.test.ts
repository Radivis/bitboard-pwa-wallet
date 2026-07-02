import { beforeEach, describe, expect, it, vi } from 'vitest'

const syncWallet = vi.fn()
const getBalance = vi.fn()
const getTransactionList = vi.fn()
const setBalance = vi.fn()
const setTransactions = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      syncWallet,
      fullScanWallet: vi.fn(),
      getBalance,
      getTransactionList,
    }),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      setBalance,
      setTransactions,
    }),
  },
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

import { syncActiveWalletAndUpdateState } from '@/lib/wallet/wallet-utils'

const settledBalance = {
  confirmedSats: 100_000,
  trustedPendingSats: 0,
  untrustedPendingSats: 0,
  immatureSats: 0,
  totalSats: 100_000,
}

describe('syncActiveWalletAndUpdateState incremental follow-up', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTransactionList.mockResolvedValue([])
  })

  it('runs one follow-up sync when first pass leaves only untrusted pending', async () => {
    getBalance
      .mockResolvedValueOnce({
        confirmedSats: 0,
        trustedPendingSats: 0,
        untrustedPendingSats: 100_000,
        immatureSats: 0,
        totalSats: 100_000,
      })
      .mockResolvedValueOnce(settledBalance)
      .mockResolvedValueOnce(settledBalance)

    await syncActiveWalletAndUpdateState('regtest')

    expect(syncWallet).toHaveBeenCalledTimes(2)
    expect(setBalance).toHaveBeenCalledWith(settledBalance)
  })

  it('does not run follow-up sync when first pass already has confirmed balance', async () => {
    getBalance.mockResolvedValue(settledBalance)

    await syncActiveWalletAndUpdateState('regtest')

    expect(syncWallet).toHaveBeenCalledTimes(1)
  })
})
