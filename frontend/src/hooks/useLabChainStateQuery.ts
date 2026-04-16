import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import {
  fetchLabChainStateForQuery,
  labChainStateQueryKey,
  toUiLabState,
} from '@/lib/lab-chain-query'
import type { LabState } from '@/workers/lab-api'

export function useLabChainStateQuery() {
  const networkMode = useWalletStore((s) => s.networkMode)

  return useQuery({
    queryKey: labChainStateQueryKey,
    queryFn: fetchLabChainStateForQuery,
    enabled: networkMode === 'lab',
    staleTime: Infinity,
    // Global default disables this; lab must refetch when the tab regains focus so we do not
    // keep a week-old snapshot next to another tab that loaded fresh from SQLite.
    refetchOnWindowFocus: 'always',
  })
}

export function prefetchLabChainState(queryClient: QueryClient): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: labChainStateQueryKey,
    queryFn: fetchLabChainStateForQuery,
    staleTime: Infinity,
  })
}

export function setLabChainStateCache(
  queryClient: QueryClient,
  state: LabState,
): void {
  queryClient.setQueryData(labChainStateQueryKey, toUiLabState(state))
}
