import { useQuery } from '@tanstack/react-query'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import {
  arkadeOperatorSyncMetadataQueryKey,
  resolveArkadeOperatorSyncMetadata,
} from '@/lib/arkade/arkade-dashboard-sync'
import { useWalletStore } from '@/stores/walletStore'

export function useArkadeSyncMetadataQuery() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const lastOperatorSyncTime = useWalletStore(
    (walletState) => walletState.lastOperatorSyncTime,
  )
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const activeArkadeConnectionId = useWalletStore(
    (walletState) => walletState.activeArkadeConnectionId,
  )

  return useQuery({
    queryKey:
      activeArkadeConnectionId != null
        ? [
            ...arkadeOperatorSyncMetadataQueryKey(activeArkadeConnectionId),
            lastOperatorSyncTime?.toISOString() ?? null,
            walletStatus,
          ]
        : ['arkade', 'dashboard', 'operator', 'inactive'],
    queryFn: resolveArkadeOperatorSyncMetadata,
    enabled:
      isArkadeActiveForNetworkMode(networkMode) &&
      isArkadeSupportedNetworkMode(networkMode) &&
      activeArkadeConnectionId != null,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
