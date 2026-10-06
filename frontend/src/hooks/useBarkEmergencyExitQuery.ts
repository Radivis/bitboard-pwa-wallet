import { useQuery } from '@tanstack/react-query'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import { keepBarkQueryDataForSameWallet } from '@/lib/bark/bark-wallet-queries'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

export function barkEmergencyExitQueryKey(
  walletId: number | null,
  networkMode: NetworkMode | null,
  lastSuccessfulSyncAt: string | null,
) {
  return ['bark', 'emergency-exits', walletId, networkMode, lastSuccessfulSyncAt] as const
}

export function useBarkEmergencyExitQuery() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  const sessionNetwork = loadSnapshot.networkMode
  const sessionReady =
    isBarkEnabled &&
    sessionNetwork != null &&
    isBarkNetworkMode(sessionNetwork) &&
    loadSnapshot.loadPhase === 'loaded' &&
    activeWalletId != null

  return useQuery({
    queryKey: barkEmergencyExitQueryKey(
      activeWalletId,
      sessionNetwork,
      syncSnapshot.lastSuccessfulSyncAt,
    ),
    enabled: sessionReady,
    placeholderData: (previousData, previousQuery) =>
      sessionNetwork == null
        ? undefined
        : keepBarkQueryDataForSameWallet(
            previousData,
            previousQuery?.queryKey,
            activeWalletId,
            sessionNetwork,
          ),
    retry: false,
    queryFn: () => getBarkWorker().listEmergencyExits(),
  })
}
