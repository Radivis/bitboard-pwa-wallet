import type { QueryClient } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import { restoreNearZeroSecretsSessionForOperation } from '@/lib/wallet/restore-near-zero-secrets-session'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import {
  activeWalletLoadQueryKeyPrefix,
  walletSecretsSessionProbeQueryKeyPrefix,
} from '@/lib/wallet/wallet-load-query-keys'

/**
 * Wallet-UI operation: restore a near-zero secrets session and refresh hydration queries.
 * The session probe can cache `false` before restore finishes; bootstrap can also keep a
 * successful result with infinite staleTime after WASM was purged. Both leave the wallet
 * gate stuck on “Unlocking wallet…”.
 */
export async function hydrateNearZeroSessionForWalletRoute(
  queryClient: QueryClient,
): Promise<boolean> {
  const restored = await restoreNearZeroSecretsSessionForOperation()
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
