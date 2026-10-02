import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

export function barkPendingActionsQueryKey(
  walletId: number | null,
  networkMode: NetworkMode,
  lastSuccessfulSyncAt: string | null,
) {
  return ['bark', 'pending-actions', walletId, networkMode, lastSuccessfulSyncAt] as const
}

export function useBarkPendingActionsQuery() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  const sessionReady =
    isBarkEnabled &&
    isBarkActiveForNetworkMode(networkMode) &&
    loadSnapshot.loadPhase === 'loaded' &&
    loadSnapshot.networkMode === networkMode &&
    activeWalletId != null
  const walletFreeForList = syncSnapshot.syncPhase !== 'syncing'

  return useQuery({
    queryKey: barkPendingActionsQueryKey(
      activeWalletId,
      networkMode,
      syncSnapshot.lastSuccessfulSyncAt,
    ),
    enabled: sessionReady && walletFreeForList,
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: () => getBarkWorker().listPendingActions(),
  })
}
