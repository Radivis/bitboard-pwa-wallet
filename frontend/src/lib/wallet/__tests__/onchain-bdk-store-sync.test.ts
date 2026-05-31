import { beforeEach, describe, expect, it, vi } from 'vitest'

const getBalance = vi.fn()
const getTransactionList = vi.fn()
const setBalance = vi.fn()
const setTransactions = vi.fn()

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
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

import { refreshWalletStoreFromLoadedBdk } from '@/lib/wallet/onchain-bdk-store-sync'

describe('refreshWalletStoreFromLoadedBdk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getBalance.mockResolvedValue({
      confirmedSats: 100,
      trustedPendingSats: 0,
      untrustedPendingSats: 0,
      immatureSats: 0,
      totalSats: 100,
    })
    getTransactionList.mockResolvedValue([
      {
        txid: 'abc',
        sentSats: 0,
        receivedSats: 100,
        feeSats: null,
        confirmationBlockHeight: 1,
        confirmationTime: 1,
        isConfirmed: true,
        isLabTx: false,
      },
    ])
  })

  it('reads balance and transactions from WASM into walletStore', async () => {
    await refreshWalletStoreFromLoadedBdk()
    expect(setBalance).toHaveBeenCalledWith(
      expect.objectContaining({ totalSats: 100 }),
    )
    expect(setTransactions).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ txid: 'abc' })]),
    )
  })
})
