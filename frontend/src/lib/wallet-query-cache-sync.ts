import type { QueryClient } from '@tanstack/react-query'
import { walletKeys } from '@/db/query-keys'
import { COMMITTED_EXTERNAL_DESCRIPTOR_QUERY_KEY } from '@/hooks/useCommittedExternalDescriptor'
import { ACTIVE_WALLET_LOAD_QUERY_ROOT } from '@/lib/wallet-load-query-keys'
import { LIGHTNING_CONNECTIONS_HYDRATION_QUERY_KEY } from '@/lib/lightning-connections-hydration'
import { LIGHTNING_DASHBOARD_QUERY_KEY } from '@/lib/lightning-dashboard-sync'
import { notifyWalletDataMayHaveChangedAfterCommit } from '@/lib/wallet-cross-tab-sync'

/**
 * Invalidates TanStack Query caches that read wallet data from SQLite or encrypted payloads
 * (wallet list, bootstrap load, Lightning hydration, dashboard, Esplora URL, backup flags, etc.).
 */
export function invalidateWalletRelatedQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: walletKeys.all })
  void queryClient.invalidateQueries({ queryKey: [ACTIVE_WALLET_LOAD_QUERY_ROOT] })
  void queryClient.invalidateQueries({ queryKey: [...LIGHTNING_CONNECTIONS_HYDRATION_QUERY_KEY] })
  void queryClient.invalidateQueries({ queryKey: [...LIGHTNING_DASHBOARD_QUERY_KEY] })
  void queryClient.invalidateQueries({ queryKey: [COMMITTED_EXTERNAL_DESCRIPTOR_QUERY_KEY] })
  void queryClient.invalidateQueries({ queryKey: ['settings', 'no_mnemonic_backup'] })
  void queryClient.invalidateQueries({ queryKey: ['customEsploraUrl'] })
}

/** Use after mutating wallet DB state so this tab’s cache and other tabs stay in sync. */
export function invalidateWalletRelatedQueriesAndNotifyOtherTabs(
  queryClient: QueryClient,
): void {
  invalidateWalletRelatedQueries(queryClient)
  notifyWalletDataMayHaveChangedAfterCommit()
}
