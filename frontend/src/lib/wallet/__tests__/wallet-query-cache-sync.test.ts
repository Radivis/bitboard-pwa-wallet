import { describe, it, expect, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { walletKeys } from '@/db/query-keys'
import { activeWalletLoadQueryKey } from '@/lib/wallet/wallet-load-query-keys'
import { LIGHTNING_DASHBOARD_QUERY_KEY } from '@/lib/lightning/lightning-dashboard-sync'
import {
  lnNwcNetworkPlausibilityQueryKey,
  lnWalletBalanceQueryKey,
  sendPageLnBalanceQueryKey,
} from '@/lib/lightning/lightning-query-keys'
import { ESPLORA_FEE_PRESETS_QUERY_KEY } from '@/hooks/useEsploraFeePresets'
import { COMMITTED_EXTERNAL_DESCRIPTOR_QUERY_KEY } from '@/hooks/useCommittedExternalDescriptor'
import { customEsploraUrlQueryKey } from '@/components/settings/EsploraUrlSettings'
import { labChainStateQueryKey } from '@/lib/lab/lab-chain-query'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'
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
    const esploraFeePresetsKey = [...ESPLORA_FEE_PRESETS_QUERY_KEY, 'testnet'] as const
    const lnBalanceKey = lnWalletBalanceQueryKey({
      connectionId: 'conn-1',
      walletId: 1,
      networkMode: 'testnet',
      config: { type: 'nwc', connectionString: 'nostr+walletconnect://example' },
    })
    const lnPlausibilityKey = lnNwcNetworkPlausibilityQueryKey(null)
    const sendPageBalanceKey = sendPageLnBalanceQueryKey('conn-1')
    const customEsploraKey = customEsploraUrlQueryKey('testnet')
    const committedDescriptorKey = [
      ...WALLET_DB_QUERY_KEY_ROOT,
      COMMITTED_EXTERNAL_DESCRIPTOR_QUERY_KEY,
      1,
      'testnet',
      'taproot',
      0,
    ] as const

    seedQuery(walletKeys.all, [{ wallet_id: 1 }])
    seedQuery(walletLoadKey, 'loaded')
    seedQuery(lightningHistoryKey, [])
    seedQuery(esploraFeePresetsKey, { Low: 1, Medium: 2, High: 3 })
    seedQuery(lnBalanceKey, { balanceSats: 1000 })
    seedQuery(lnPlausibilityKey, { delta: 0 })
    seedQuery(sendPageBalanceKey, { balanceSats: 500 })
    seedQuery(customEsploraKey, 'https://mempool.space/testnet/api')
    seedQuery(committedDescriptorKey, 'tr(...)')
    seedQuery(labChainStateQueryKey, { blocks: [] })

    invalidateWalletRelatedQueries(queryClient)

    await waitFor(() => {
      expect(queryIsInvalidated(walletKeys.all)).toBe(true)
      expect(queryIsInvalidated(walletLoadKey)).toBe(true)
      expect(queryIsInvalidated(lightningHistoryKey)).toBe(true)
      expect(queryIsInvalidated(esploraFeePresetsKey)).toBe(true)
      expect(queryIsInvalidated(lnBalanceKey)).toBe(true)
      expect(queryIsInvalidated(lnPlausibilityKey)).toBe(true)
      expect(queryIsInvalidated(sendPageBalanceKey)).toBe(true)
      expect(queryIsInvalidated(customEsploraKey)).toBe(true)
      expect(queryIsInvalidated(committedDescriptorKey)).toBe(true)
    })
    expect(queryIsInvalidated(labChainStateQueryKey)).toBe(false)
  })
})
