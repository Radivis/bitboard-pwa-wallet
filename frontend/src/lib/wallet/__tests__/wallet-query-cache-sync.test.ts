import { describe, it, expect, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { walletKeys } from '@/db/query-keys'
import { activeWalletLoadQueryKey } from '@/lib/wallet/wallet-load-query-keys'
import { LIGHTNING_DASHBOARD_QUERY_KEY } from '@/lib/lightning/lightning-dashboard-sync'
import { labChainStateQueryKey } from '@/lib/lab/lab-chain-query'
import { invalidateWalletRelatedQueries } from '@/lib/wallet/wallet-query-cache-sync'

describe('invalidateWalletRelatedQueries', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  function seedQuery(key: readonly unknown[], data: unknown) {
    queryClient.setQueryData(key, data)
  }

  function queryIsInvalidated(key: readonly unknown[]) {
    return queryClient.getQueryState(key)?.isInvalidated === true
  }

  it('invalidates wallet_db-prefixed queries and leaves unrelated caches', async () => {
    const walletLoadKey = activeWalletLoadQueryKey({
      activeWalletId: 1,
      sessionPresent: true,
      networkMode: 'testnet',
      addressType: 'taproot',
      accountId: 0,
    })
    const lightningHistoryKey = [...LIGHTNING_DASHBOARD_QUERY_KEY, 'history', 'fp1'] as const

    seedQuery(walletKeys.all, [{ wallet_id: 1 }])
    seedQuery(walletLoadKey, 'loaded')
    seedQuery(lightningHistoryKey, [])
    seedQuery(labChainStateQueryKey, { blocks: [] })

    invalidateWalletRelatedQueries(queryClient)

    await waitFor(() => {
      expect(queryIsInvalidated(walletKeys.all)).toBe(true)
      expect(queryIsInvalidated(walletLoadKey)).toBe(true)
      expect(queryIsInvalidated(lightningHistoryKey)).toBe(true)
    })
    expect(queryIsInvalidated(labChainStateQueryKey)).toBe(false)
  })
})
