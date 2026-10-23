import { useQuery } from '@tanstack/react-query'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { orchestrateBarkSync } from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'
import { usePeriodicSyncRefetchInterval } from '@/lib/wallet/periodic-sync/usePeriodicSyncRefetchInterval'
import { useWalletStore } from '@/stores/walletStore'

const barkPeriodicSyncQueryKeyRoot = ['bark', 'periodic-sync'] as const

type BarkPeriodicSyncQueryData = 'completed'

export function useBarkPeriodicSyncQuery(): void {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const refetchInterval = usePeriodicSyncRefetchInterval('bark')
  const barkActive = isBarkActiveForNetworkMode(networkMode)
  const enabled =
    barkActive &&
    activeWalletId != null &&
    loadSnapshot.loadPhase === 'loaded' &&
    loadSnapshot.networkMode === networkMode

  useQuery({
    queryKey: [...barkPeriodicSyncQueryKeyRoot, activeWalletId, networkMode],
    queryFn: async (): Promise<BarkPeriodicSyncQueryData> => {
      if (activeWalletId == null) {
        return 'completed'
      }
      await orchestrateBarkSync({
        walletId: activeWalletId,
        networkMode,
        throwOnError: false,
      })
      return 'completed'
    },
    enabled,
    refetchInterval,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
