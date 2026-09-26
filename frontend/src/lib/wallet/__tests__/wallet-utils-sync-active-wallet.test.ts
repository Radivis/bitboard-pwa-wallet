import { beforeEach, describe, expect, it, vi } from 'vitest'

const syncWallet = vi.fn()
const fullScanWallet = vi.fn()
const getBalance = vi.fn()
const getTransactionList = vi.fn()
const setBalance = vi.fn()
const setTransactions = vi.fn()
const walletState = {
  activeWalletId: 1 as number | null,
}

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
      fullScanWallet,
      getBalance,
      getTransactionList,
    }),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      activeWalletId: walletState.activeWalletId,
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

import { toast } from 'sonner'
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
    walletState.activeWalletId = 1
    fullScanWallet.mockResolvedValue(undefined)
    vi.mocked(toast.loading).mockReturnValue('scan-toast' as unknown as string & number)
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

  it('does not toast Wallet synced when the active wallet changed during a full scan', async () => {
    fullScanWallet.mockImplementation(async () => {
      walletState.activeWalletId = 2
    })
    getBalance.mockResolvedValue(settledBalance)

    await syncActiveWalletAndUpdateState('regtest', { useFullScan: true, walletId: 1 })

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.dismiss).toHaveBeenCalledWith('scan-toast')
    expect(setBalance).not.toHaveBeenCalled()
  })
})
