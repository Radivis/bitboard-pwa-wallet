import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import {
  labChainStateQueryKey,
  toUiLabState,
} from '@/lib/lab-chain-query'
import { labOpLoadChainFromDatabase } from '@/lib/lab-worker-operations'
import type { LabState } from '@/workers/lab-api'

export function useLabChainStateQuery() {
  const networkMode = useWalletStore((s) => s.networkMode)

  return useQuery({
    queryKey: labChainStateQueryKey,
    queryFn: async () => {
      const raw = await labOpLoadChainFromDatabase()
      return toUiLabState(raw)
    },
    enabled: networkMode === 'lab',
    staleTime: Infinity,
  })
}

export function prefetchLabChainState(queryClient: QueryClient): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: labChainStateQueryKey,
    queryFn: async () => {
      const raw = await labOpLoadChainFromDatabase()
      return toUiLabState(raw)
    },
    staleTime: Infinity,
  })
}

export function setLabChainStateCache(
  queryClient: QueryClient,
  state: LabState,
): void {
  queryClient.setQueryData(labChainStateQueryKey, toUiLabState(state))
}
