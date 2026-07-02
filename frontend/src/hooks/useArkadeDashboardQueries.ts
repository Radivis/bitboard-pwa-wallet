import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import {
  arkadeOperatorSyncMetadataQueryKey,
  resolveArkadeOperatorSyncMetadata,
} from '@/lib/arkade/arkade-dashboard-sync'
import { useIsArkadeSessionReady } from '@/hooks/useArkadeLifecycleSnapshots'
import { useWalletStore } from '@/stores/walletStore'

export function useArkadeSyncMetadataQuery() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const lastOperatorSyncTime = useWalletStore(
    (walletState) => walletState.lastOperatorSyncTime,
  )
  const activeArkadeConnectionId = useWalletStore(
    (walletState) => walletState.activeArkadeConnectionId,
  )
  const arkadeSessionReady = useIsArkadeSessionReady()

  return useQuery({
    queryKey:
      activeArkadeConnectionId != null
        ? [
            ...arkadeOperatorSyncMetadataQueryKey(activeArkadeConnectionId),
            lastOperatorSyncTime?.toISOString() ?? null,
          ]
        : ['arkade', 'dashboard', 'operator', 'inactive'],
    queryFn: resolveArkadeOperatorSyncMetadata,
    enabled:
      arkadeSessionReady &&
      isArkadeActiveForNetworkMode(networkMode) &&
      isArkadeSupportedNetworkMode(networkMode) &&
      activeArkadeConnectionId != null,
    staleTime: 0,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  })
}
