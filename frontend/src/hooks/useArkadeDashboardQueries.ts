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
  const activeArkadeAccountId = useWalletStore(
    (walletState) => walletState.activeArkadeAccountId,
  )
  const arkadeSessionReady = useIsArkadeSessionReady()

  return useQuery({
    queryKey:
      activeArkadeAccountId != null
        ? [
            ...arkadeOperatorSyncMetadataQueryKey(activeArkadeAccountId),
            lastOperatorSyncTime?.toISOString() ?? null,
          ]
        : ['arkade', 'dashboard', 'operator', 'inactive'],
    queryFn: resolveArkadeOperatorSyncMetadata,
    enabled:
      arkadeSessionReady &&
      isArkadeActiveForNetworkMode(networkMode) &&
      isArkadeSupportedNetworkMode(networkMode) &&
      activeArkadeAccountId != null,
    staleTime: 0,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  })
}
