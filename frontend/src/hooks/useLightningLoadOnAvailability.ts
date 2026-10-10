import { useEffect, useRef } from 'react'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore } from '@/stores/walletStore'
import { isLightningSupported } from '@/lib/lightning/lightning-utils'
import { orchestrateLightningLoad } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'

/**
 * Unlock loads Lightning connections only when Lightning is usable at that moment.
 * When it becomes usable later while the wallet stays unlocked (feature enabled,
 * feature store hydrated after unlock, or switch to a Lightning network), load then.
 */
export function useLightningLoadOnAvailability(): void {
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const isLightningAvailable = isLightningEnabled && isLightningSupported(networkMode)
  const wasLightningAvailableRef = useRef(isLightningAvailable)

  useEffect(() => {
    const becameAvailable = isLightningAvailable && !wasLightningAvailableRef.current
    wasLightningAvailableRef.current = isLightningAvailable
    if (!becameAvailable) return

    const { activeWalletId, walletStatus, networkMode: currentNetworkMode } =
      useWalletStore.getState()
    if (activeWalletId == null || walletStatus !== 'unlocked') return

    void orchestrateLightningLoad({
      walletId: activeWalletId,
      networkMode: currentNetworkMode,
    }).catch((err) => {
      void import('@/lib/wallet/rail-sync-error-toast').then(({ reportLightningLoadError }) =>
        reportLightningLoadError(err),
      )
    })
  }, [isLightningAvailable])
}
