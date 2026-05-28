import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { useWalletStore } from '@/stores/walletStore'
import { labChainStateQueryKey } from '@/lib/lab/lab-chain-query'
import { invalidateLabPaginatedQueries } from '@/lib/lab/lab-paginated-queries'
import { subscribeLabStatePersistedFromOtherTabs } from '@/lib/lab/lab-cross-tab-sync'

/**
 * Keeps lab TanStack Query caches aligned with SQLite when multiple tabs are open, and when
 * the user returns to this tab (another tab may have updated the DB without this tab seeing
 * a BroadcastChannel message, e.g. read-only navigation).
 */
export function useLabCrossTabCacheSync(): void {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const queryClient = useQueryClient()

  const invalidateLabQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: labChainStateQueryKey })
    void invalidateLabPaginatedQueries(queryClient)
  }, [queryClient])

  useEffect(() => {
    if (networkMode !== 'lab') return
    return subscribeLabStatePersistedFromOtherTabs(invalidateLabQueries)
  }, [networkMode, invalidateLabQueries])

  useEffect(() => {
    if (networkMode !== 'lab') return
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      invalidateLabQueries()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [networkMode, invalidateLabQueries])
}
