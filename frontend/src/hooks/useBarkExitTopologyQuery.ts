import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import { keepBarkQueryDataForSameWallet } from '@/lib/bark/bark-wallet-queries'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

export function barkExitTopologyQueryKey(
  walletId: number | null,
  networkMode: NetworkMode,
  vtxoIds: string[],
  lastSuccessfulSyncAt: string | null,
) {
  return ['bark', 'exit-topology', walletId, networkMode, vtxoIds, lastSuccessfulSyncAt] as const
}

export function useBarkExitTopologyQuery(vtxoIds: string[]) {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  const sortedVtxoIds = useMemo(() => [...vtxoIds].sort(), [vtxoIds])
  const sessionReady =
    isBarkEnabled &&
    isBarkActiveForNetworkMode(networkMode) &&
    loadSnapshot.loadPhase === 'loaded' &&
    loadSnapshot.networkMode === networkMode &&
    activeWalletId != null
  const walletFreeForList = syncSnapshot.syncPhase !== 'syncing'

  return useQuery({
    queryKey: barkExitTopologyQueryKey(
      activeWalletId,
      networkMode,
      sortedVtxoIds,
      syncSnapshot.lastSuccessfulSyncAt,
    ),
    enabled: sessionReady && walletFreeForList && sortedVtxoIds.length > 0,
    placeholderData: (previousData, previousQuery) =>
      keepBarkQueryDataForSameWallet(
        previousData,
        previousQuery?.queryKey,
        activeWalletId,
        networkMode,
      ),
    retry: false,
    queryFn: () => getBarkWorker().exitTopology(sortedVtxoIds),
  })
}
