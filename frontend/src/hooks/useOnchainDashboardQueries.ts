import { useQuery } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import { useIsOnchainRailLoaded } from '@/hooks/useOnchainLifecycleSnapshots'
import {
  getActiveDescriptorWalletKey,
  onchainEsploraSyncMetadataQueryKey,
  resolveOnchainEsploraSyncMetadata,
} from '@/lib/wallet/onchain-dashboard-sync'

export function useOnchainEsploraSyncMetadataQuery() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const lastSyncTime = useWalletStore((walletState) => walletState.lastSyncTime)
  const descriptorWalletKey = getActiveDescriptorWalletKey()
  const onchainRailLoaded = useIsOnchainRailLoaded()

  return useQuery({
    queryKey:
      descriptorWalletKey != null
        ? [
            ...onchainEsploraSyncMetadataQueryKey(descriptorWalletKey),
            lastSyncTime?.toISOString() ?? null,
          ]
        : ['onchain', 'dashboard', 'esplora', 'inactive'],
    queryFn: resolveOnchainEsploraSyncMetadata,
    enabled: networkMode !== 'lab' && descriptorWalletKey != null && onchainRailLoaded,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
