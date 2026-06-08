import { beforeEach, describe, expect, it, vi } from 'vitest'

const getBalanceMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ confirmedSats: 47_000, totalSats: 47_000 }),
)
const getTransactionHistoryMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    {
      direction: 'incoming',
      amountSats: 5_000,
      timestamp: 1_700_000_100,
      txid: 'feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface',
      memo: null,
    },
  ]),
)
const getAddressMock = vi.hoisted(() => vi.fn().mockResolvedValue('tark1qreceive'))

const setQueryDataMock = vi.hoisted(() => vi.fn())

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    getBalance: getBalanceMock,
    getTransactionHistory: getTransactionHistoryMock,
    getAddress: getAddressMock,
  }),
}))

vi.mock('@/lib/shared/app-query-client', () => ({
  appQueryClient: {
    setQueryData: (...args: unknown[]) => setQueryDataMock(...args),
  },
}))

import { refreshArkadeStoreFromLoadedWasm } from '@/lib/arkade/arkade-persistence-store-sync'
import {
  arkadeAddressQueryKey,
  arkadeBalanceQueryKey,
  arkadeHistoryQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import { useWalletStore } from '@/stores/walletStore'

describe('refreshArkadeStoreFromLoadedWasm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWalletStore.setState({
      activeWalletId: 1,
      networkMode: 'signet',
      activeArkadeConnectionId: 'conn-1',
      arkadeBalance: null,
      arkadePayments: [],
      arkadeReceiveAddress: null,
    })
  })

  it('updates wallet store and React Query caches for balance, history, and address', async () => {
    await refreshArkadeStoreFromLoadedWasm('conn-1')

    const state = useWalletStore.getState()
    expect(state.arkadeBalance).toEqual({ confirmedSats: 47_000, totalSats: 47_000 })
    expect(state.arkadePayments).toHaveLength(1)
    expect(state.arkadeReceiveAddress).toBe('tark1qreceive')

    expect(setQueryDataMock).toHaveBeenCalledWith(
      arkadeBalanceQueryKey(1, 'signet', 'conn-1'),
      { confirmedSats: 47_000, totalSats: 47_000 },
    )
    expect(setQueryDataMock).toHaveBeenCalledWith(
      arkadeHistoryQueryKey(1, 'signet', 'conn-1'),
      state.arkadePayments,
    )
    expect(setQueryDataMock).toHaveBeenCalledWith(
      arkadeAddressQueryKey(1, 'signet', 'conn-1'),
      'tark1qreceive',
    )
  })
})
