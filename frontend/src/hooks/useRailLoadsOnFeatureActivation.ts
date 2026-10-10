import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore } from '@/stores/walletStore'
import { isLightningSupported } from '@/lib/lightning/lightning-utils'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import { startBarkLoadAfterUnlock } from '@/lib/bark/bark-session-service'
import { orchestrateLightningLoad } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'
import { orchestrateArkadeLoad } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import {
  useRailLoadOnFeatureActivation,
  type RailLoadTarget,
} from '@/hooks/useRailLoadOnFeatureActivation'

function startLightningLoad(target: RailLoadTarget): void {
  void orchestrateLightningLoad({ ...target, allowRetryFromError: true }).catch((err) => {
    void import('@/lib/wallet/rail-sync-error-toast').then(({ reportLightningLoadError }) =>
      reportLightningLoadError(err),
    )
  })
}

function startArkadeLoad(target: RailLoadTarget): void {
  void orchestrateArkadeLoad({ ...target, allowRetryFromError: true }).catch((err) => {
    void import('@/lib/arkade/arkade-session-open-error-toast').then(
      ({ reportArkadeSessionOpenError }) => reportArkadeSessionOpenError(err),
    )
  })
}

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
    startRailLoad: startLightningLoad,
  })
  useRailLoadOnFeatureActivation({
    isRailActivated: isArkadeEnabled,
    isRailActiveForNetwork: isArkadeActiveForNetworkMode,
    startRailLoad: startArkadeLoad,
  })
  useRailLoadOnFeatureActivation({
    isRailActivated: isBarkEnabled,
    isRailActiveForNetwork: isBarkActiveForNetworkMode,
    startRailLoad: startBarkLoadAfterUnlock,
  })
}
