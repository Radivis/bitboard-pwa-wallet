import { useQuery } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import {
  getActiveDescriptorWalletKey,
  onchainEsploraSyncMetadataQueryKey,
  resolveOnchainEsploraSyncMetadata,
} from '@/lib/wallet/onchain-dashboard-sync'

export function useOnchainEsploraSyncMetadataQuery() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const lastSyncTime = useWalletStore((walletState) => walletState.lastSyncTime)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const descriptorWalletKey = getActiveDescriptorWalletKey()

  return useQuery({
    queryKey:
      descriptorWalletKey != null
        ? [
            ...onchainEsploraSyncMetadataQueryKey(descriptorWalletKey),
            lastSyncTime?.toISOString() ?? null,
            walletStatus,
          ]
        : ['onchain', 'dashboard', 'esplora', 'inactive'],
    queryFn: resolveOnchainEsploraSyncMetadata,
    enabled: networkMode !== 'lab' && descriptorWalletKey != null,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
