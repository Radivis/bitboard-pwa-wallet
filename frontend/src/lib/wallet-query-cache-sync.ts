import type { QueryClient } from '@tanstack/react-query'
import { notifyWalletDataMayHaveChangedAfterCommit } from '@/lib/wallet-cross-tab-sync'
import { WALLET_RELATED_QUERY_INVALIDATIONS } from '@/lib/wallet-related-query-invalidation'

/**
 * Invalidates TanStack Query caches that read wallet data from SQLite or encrypted payloads
 * (wallet list, bootstrap load, Lightning hydration, dashboard, Esplora URL, backup flags, etc.).
 */
export function invalidateWalletRelatedQueries(queryClient: QueryClient): void {
  for (const filters of WALLET_RELATED_QUERY_INVALIDATIONS) {
    void queryClient.invalidateQueries(filters)
  }
}

/** Use after mutating wallet DB state so this tab’s cache and other tabs stay in sync. */
export function invalidateWalletRelatedQueriesAndNotifyOtherTabs(
  queryClient: QueryClient,
): void {
  invalidateWalletRelatedQueries(queryClient)
  notifyWalletDataMayHaveChangedAfterCommit()
}
