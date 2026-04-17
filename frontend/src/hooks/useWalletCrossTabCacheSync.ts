import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { invalidateWalletRelatedQueries } from '@/lib/wallet-query-cache-sync'
import { subscribeWalletDataChangedFromOtherTabs } from '@/lib/wallet-cross-tab-sync'

/**
 * Keeps wallet-related TanStack Query caches aligned with the shared SQLite DB when multiple
 * tabs are open, and when the user returns to this tab (another tab may have updated data).
 */
export function useWalletCrossTabCacheSync(): void {
  const queryClient = useQueryClient()

  const invalidate = useCallback(() => {
    invalidateWalletRelatedQueries(queryClient)
  }, [queryClient])

  useEffect(() => {
    return subscribeWalletDataChangedFromOtherTabs(invalidate)
  }, [invalidate])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      invalidate()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [invalidate])
}
