import { appQueryClient } from '@/lib/shared/app-query-client'
import type { NetworkMode } from '@/stores/walletStore'

/** Bark list queries are `['bark', scope, walletId, networkMode, ...]`. */
const BARK_QUERY_WALLET_ID_INDEX = 2
const BARK_QUERY_NETWORK_MODE_INDEX = 3

/** Drops cached Bark lists so the next wallet cannot render the previous wallet's rows. */
export function removeBarkWalletQueries(): void {
  appQueryClient.removeQueries({ queryKey: ['bark'] })
}

/**
 * Keeps the previous query result while a sync stamp changes.
 * A different wallet or network gets no placeholder.
 */
export function keepBarkQueryDataForSameWallet<TData>(
  previousData: TData | undefined,
  previousQueryKey: readonly unknown[] | undefined,
  walletId: number | null,
  networkMode: NetworkMode,
): TData | undefined {
  if (previousData == null || previousQueryKey == null) return undefined
  if (previousQueryKey[BARK_QUERY_WALLET_ID_INDEX] !== walletId) return undefined
  if (previousQueryKey[BARK_QUERY_NETWORK_MODE_INDEX] !== networkMode) return undefined
  return previousData
}
