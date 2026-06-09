import { appQueryClient } from '@/lib/shared/app-query-client'
import { useLightningStore } from '@/stores/lightningStore'
import { loadLightningConnectionsForWallet } from '@/lib/lightning/lightning-wallet-secrets'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'

/** TanStack Query key prefix; pair with `activeWalletId` in hooks. */
export const LIGHTNING_CONNECTIONS_HYDRATION_QUERY_KEY = [
  ...WALLET_DB_QUERY_KEY_ROOT,
  'lightning',
  'connections-hydration',
] as const

/**
 * Loads NWC connections from encrypted wallet secrets, then replaces the
 * in-memory slice for this wallet.
 */
export async function hydrateLightningConnectionsForWallet(params: {
  walletId: number
}): Promise<void> {
  const connections = await loadLightningConnectionsForWallet(params)
  useLightningStore.getState().replaceConnectionsForWallet(params.walletId, connections)
}

/** Call when purging lightning from memory so the next unlock refetches (stale cache would skip `queryFn`). */
export function removeLightningConnectionsHydrationQueries(): void {
  appQueryClient.removeQueries({
    queryKey: LIGHTNING_CONNECTIONS_HYDRATION_QUERY_KEY,
  })
}
