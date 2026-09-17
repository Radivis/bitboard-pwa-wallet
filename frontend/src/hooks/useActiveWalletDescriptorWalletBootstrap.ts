import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import { activeWalletLoadQueryKeyPrefix } from '@/lib/wallet/wallet-load-query-keys'
import { useActiveWalletLoadQuery } from '@/hooks/useActiveWalletLoadQuery'

/**
 * Loads the active descriptor wallet into WASM when a session exists but the wallet is
 * not yet unlocked (e.g. after reload or returning from a locked state). Replaces
 * the previous imperative auto-unlock effect in AppInitializer.
 */
export function useActiveWalletDescriptorWalletBootstrap(): void {
  const queryClient = useQueryClient()
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  useActiveWalletLoadQuery()

  useEffect(() => {
    if (walletStatus !== 'locked') return
    const hasSuccessfulBootstrap = queryClient
      .getQueriesData({ queryKey: [...activeWalletLoadQueryKeyPrefix] })
      .some(([, bootstrapData]) => bootstrapData != null)
    if (!hasSuccessfulBootstrap) return
    queryClient.removeQueries({ queryKey: [...activeWalletLoadQueryKeyPrefix] })
  }, [walletStatus, queryClient])
}
