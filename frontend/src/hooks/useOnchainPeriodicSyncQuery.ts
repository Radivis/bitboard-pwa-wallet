import { useQuery } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import { useIsOnchainRailLoaded } from '@/hooks/useOnchainLifecycleSnapshots'
import { getActiveDescriptorWalletKey } from '@/lib/wallet/onchain-dashboard-sync'
import { runIncrementalDashboardWalletSync } from '@/lib/wallet/wallet-utils'
import { usePeriodicSyncRefetchInterval } from '@/lib/wallet/periodic-sync/usePeriodicSyncRefetchInterval'

const onchainPeriodicSyncQueryKeyRoot = ['onchain', 'periodic-sync'] as const

export function onchainPeriodicSyncQueryKey(
  descriptorWalletKey: string,
  networkMode: string,
  walletId: number | null,
) {
  return [...onchainPeriodicSyncQueryKeyRoot, descriptorWalletKey, networkMode, walletId] as const
}

/**
 * Background Esplora incremental sync when periodic sync is enabled for the on-chain rail.
 */
export function useOnchainPeriodicSyncQuery(): void {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const descriptorWalletKey = getActiveDescriptorWalletKey()
  const onchainRailLoaded = useIsOnchainRailLoaded()
  const refetchInterval = usePeriodicSyncRefetchInterval('onchain')

  const enabled =
    networkMode !== 'lab' && descriptorWalletKey != null && onchainRailLoaded

  useQuery({
    queryKey:
      descriptorWalletKey != null
        ? onchainPeriodicSyncQueryKey(descriptorWalletKey, networkMode, activeWalletId)
        : [...onchainPeriodicSyncQueryKeyRoot, 'inactive'],
    queryFn: () =>
      runIncrementalDashboardWalletSync({ networkMode, activeWalletId }),
    enabled,
    refetchInterval,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
