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
  const balanceTotalSats = useWalletStore(
    (walletState) => walletState.balance?.totalSats ?? null,
  )
  const transactionCount = useWalletStore(
    (walletState) => walletState.transactions.length,
  )
  const descriptorWalletKey = getActiveDescriptorWalletKey()

  return useQuery({
    queryKey:
      descriptorWalletKey != null
        ? [
            ...onchainEsploraSyncMetadataQueryKey(descriptorWalletKey),
            lastSyncTime?.toISOString() ?? null,
            walletStatus,
            balanceTotalSats,
            transactionCount,
          ]
        : ['onchain', 'dashboard', 'esplora', 'inactive'],
    queryFn: resolveOnchainEsploraSyncMetadata,
    enabled: networkMode !== 'lab' && descriptorWalletKey != null,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

/** @deprecated Use {@link useOnchainEsploraSyncMetadataQuery} */
export function useOnchainDashboardBalanceQuery() {
  const query = useOnchainEsploraSyncMetadataQuery()
  return {
    ...query,
    data: query.data
      ? {
          isStaleBalance: query.data.isStaleOnchain,
          balanceSnapshotAt: query.data.lastSuccessfulEsploraSyncAt,
        }
      : query.data,
  }
}

/** @deprecated Use {@link useOnchainEsploraSyncMetadataQuery} */
export function useOnchainDashboardHistoryQuery() {
  const query = useOnchainEsploraSyncMetadataQuery()
  return {
    ...query,
    data: query.data
      ? {
          staleTransactionsAsOf: query.data.isStaleOnchain
            ? query.data.lastSuccessfulEsploraSyncAt
            : undefined,
        }
      : query.data,
  }
}
