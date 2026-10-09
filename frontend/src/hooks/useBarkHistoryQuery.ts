import { useQuery } from '@tanstack/react-query'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

export function barkHistoryQueryKey(walletId: number | null, networkMode: NetworkMode) {
  return ['bark', 'history', walletId, networkMode] as const
}

export function useBarkHistoryQuery() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const sessionReady =
    isBarkEnabled &&
    isBarkActiveForNetworkMode(networkMode) &&
    loadSnapshot.loadPhase === 'loaded' &&
    loadSnapshot.networkMode === networkMode &&
    activeWalletId != null

  return useQuery({
    queryKey: barkHistoryQueryKey(activeWalletId, networkMode),
    enabled: sessionReady,
    queryFn: () => getBarkWorker().history(),
  })
}
