import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore } from '@/stores/walletStore'
import { isLightningSupported } from '@/lib/lightning/lightning-utils'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { startBarkLoadAfterUnlock } from '@/lib/bark/bark-session-service'
import {
  startArkadeLoadAfterUnlock,
  startLightningLoadAfterUnlock,
} from '@/lib/wallet/lifecycle/rail-load-starters'
import { useRailLoadOnFeatureActivation } from '@/hooks/useRailLoadOnFeatureActivation'

/**
 * Lightning has no network-switch reload, so its activation includes the network.
 * Arkade and Bark reload on network switch already, so only their feature flags count.
 */
export function useRailLoadsOnFeatureActivation(): void {
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const isArkadeEnabled = useFeatureStore((featureState) => featureState.isArkadeEnabled)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)

  useRailLoadOnFeatureActivation({
    isRailActivated: isLightningEnabled && isLightningSupported(networkMode),
    isRailActiveForNetwork: isLightningSupported,
    startRailLoad: startLightningLoadAfterUnlock,
  })
  useRailLoadOnFeatureActivation({
    isRailActivated: isArkadeEnabled,
    isRailActiveForNetwork: isArkadeActiveForNetworkMode,
    startRailLoad: startArkadeLoadAfterUnlock,
  })
  useRailLoadOnFeatureActivation({
    isRailActivated: isBarkEnabled,
    isRailActiveForNetwork: isBarkActiveForNetworkMode,
    startRailLoad: startBarkLoadAfterUnlock,
  })
}
