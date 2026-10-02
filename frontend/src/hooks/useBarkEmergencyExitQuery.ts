import { useQuery } from '@tanstack/react-query'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import { keepBarkQueryDataForSameWallet } from '@/lib/bark/bark-wallet-queries'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

export function barkEmergencyExitQueryKey(
  walletId: number | null,
  networkMode: NetworkMode,
) {
  return ['bark', 'emergency-exits', walletId, networkMode] as const
}

export function useBarkEmergencyExitQuery() {
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
    queryKey: barkEmergencyExitQueryKey(activeWalletId, networkMode),
    enabled: sessionReady && walletFreeForList,
    placeholderData: (previousData, previousQuery) =>
      keepBarkQueryDataForSameWallet(
        previousData,
        previousQuery?.queryKey,
        activeWalletId,
        networkMode,
      ),
    retry: false,
    queryFn: () => getBarkWorker().listEmergencyExits(),
  })
}
