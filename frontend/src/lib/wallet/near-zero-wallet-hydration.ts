import type { QueryClient } from '@tanstack/react-query'
import { getDatabase, tryLoadNearZeroSessionIntoMemory } from '@/db'
import { useWalletStore } from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import {
  activeWalletLoadQueryKeyPrefix,
  walletSecretsSessionProbeQueryKeyPrefix,
} from '@/lib/wallet/wallet-load-query-keys'

/**
 * Restores a near-zero secrets session and refreshes wallet-route hydration queries.
 * The session probe can cache `false` before restore finishes; bootstrap can also keep a
 * successful result with infinite staleTime after WASM was purged. Both leave the wallet
 * gate stuck on “Unlocking wallet…”.
 */
export async function hydrateNearZeroSessionForWalletRoute(
  queryClient: QueryClient,
): Promise<boolean> {
  const restored = await tryLoadNearZeroSessionIntoMemory(getDatabase())
  if (!restored) {
    return false
  }

  await queryClient.invalidateQueries({
    queryKey: [...walletSecretsSessionProbeQueryKeyPrefix],
  })

  const stillGated = !walletIsUnlockedOrSyncing(useWalletStore.getState().walletStatus)
  const bootstrapInFlight =
    queryClient.isFetching({ queryKey: [...activeWalletLoadQueryKeyPrefix] }) > 0
  if (stillGated && !bootstrapInFlight) {
    queryClient.removeQueries({ queryKey: [...activeWalletLoadQueryKeyPrefix] })
  }

  return true
}
