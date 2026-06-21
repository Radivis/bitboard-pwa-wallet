import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useFeatureStore } from '@/stores/featureStore'
import { useLightningStore } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'
import { getLightningConnectionsForActiveWallet } from '@/lib/lightning/lightning-connection-utils'
import { isLightningSupported } from '@/lib/lightning/lightning-utils'
import {
  lightningConnectionsFingerprint,
  lightningSyncMetadataQueryKey,
  resolveLightningSyncMetadata,
} from '@/lib/lightning/lightning-dashboard-sync'
import { useIsLightningRailLoaded } from '@/hooks/useLightningLifecycleSnapshots'

export function useLightningSyncMetadataQuery() {
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const connectedWallets = useLightningStore((lightningState) => lightningState.connectedWallets)
  const lightningRailLoaded = useIsLightningRailLoaded()

  const matchingConnections = useMemo(
    () =>
      getLightningConnectionsForActiveWallet({
        connectedLightningWallets: connectedWallets,
        activeWalletId,
        networkMode,
        isLightningEnabled,
      }),
    [isLightningEnabled, networkMode, activeWalletId, connectedWallets],
  )

  const fingerprint = lightningConnectionsFingerprint(matchingConnections)

  return useQuery({
    queryKey: lightningSyncMetadataQueryKey(fingerprint),
    queryFn: resolveLightningSyncMetadata,
    enabled:
      isLightningEnabled &&
      isLightningSupported(networkMode) &&
      activeWalletId != null &&
      lightningRailLoaded &&
      matchingConnections.length > 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
