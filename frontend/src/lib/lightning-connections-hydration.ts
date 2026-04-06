import { appQueryClient } from '@/lib/app-query-client'
import { useLightningStore } from '@/stores/lightningStore'
import { loadLightningConnectionsForWallet } from '@/lib/lightning-wallet-secrets'

/** TanStack Query key prefix; pair with `activeWalletId` in hooks. */
export const LIGHTNING_CONNECTIONS_HYDRATION_QUERY_KEY = [
  'lightning-connections-hydration',
] as const

/**
 * Loads NWC connections from encrypted wallet secrets, then replaces the
 * in-memory slice for this wallet.
 */
export async function hydrateLightningConnectionsForWallet(params: {
  password: string
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
