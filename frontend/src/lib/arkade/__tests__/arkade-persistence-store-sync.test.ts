import { beforeEach, describe, expect, it, vi } from 'vitest'

const getLiveDashboardMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    balance: { confirmedSats: 47_000, totalSats: 47_000 },
    payments: [
      {
        direction: 'incoming',
        amountSats: 5_000,
        timestamp: 1_700_000_100,
        txid: 'feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface',
        memo: null,
      },
    ],
  }),
)
const getAddressMock = vi.hoisted(() => vi.fn().mockResolvedValue('tark1qreceive'))

const setQueryDataMock = vi.hoisted(() => vi.fn())
const invalidateQueriesMock = vi.hoisted(() => vi.fn())

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    getLiveDashboard: getLiveDashboardMock,
    getAddress: getAddressMock,
  }),
}))

vi.mock('@/lib/shared/app-query-client', () => ({
  appQueryClient: {
    setQueryData: (...args: unknown[]) => setQueryDataMock(...args),
    invalidateQueries: (...args: unknown[]) => invalidateQueriesMock(...args),
  },
}))

import { refreshArkadeStoreFromLoadedWasm } from '@/lib/arkade/arkade-persistence-store-sync'
import {
  arkadeAddressQueryKey,
  arkadeBalanceQueryKey,
  arkadeHistoryQueryKey,
  arkadeReceiveGapQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import { useWalletStore } from '@/stores/walletStore'

describe('refreshArkadeStoreFromLoadedWasm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWalletStore.setState({
      activeWalletId: 1,
      networkMode: 'mutinynet',
      activeArkadeAccountId: 'conn-1',
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
      arkadeBalanceQueryKey({
        walletId: 1,
        networkMode: 'mutinynet',
        arkadeAccountId: 'conn-1',
      }),
      { confirmedSats: 47_000, totalSats: 47_000 },
    )
    expect(setQueryDataMock).toHaveBeenCalledWith(
      arkadeHistoryQueryKey({
        walletId: 1,
        networkMode: 'mutinynet',
        arkadeAccountId: 'conn-1',
      }),
      state.arkadePayments,
    )
    expect(setQueryDataMock).toHaveBeenCalledWith(
      arkadeAddressQueryKey({
        walletId: 1,
        networkMode: 'mutinynet',
        arkadeAccountId: 'conn-1',
      }),
      'tark1qreceive',
    )
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: arkadeReceiveGapQueryKey({
        walletId: 1,
        networkMode: 'mutinynet',
        arkadeAccountId: 'conn-1',
      }),
    })
  })

  it('does not write the previous session when the active wallet changed', async () => {
    useWalletStore.setState({ activeWalletId: 2 })

    await refreshArkadeStoreFromLoadedWasm('conn-1', 1)

    const state = useWalletStore.getState()
    expect(state.arkadeBalance).toBeNull()
    expect(state.arkadePayments).toEqual([])
    expect(setQueryDataMock).not.toHaveBeenCalled()
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })
})
