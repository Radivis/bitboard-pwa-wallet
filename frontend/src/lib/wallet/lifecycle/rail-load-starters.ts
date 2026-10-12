import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { orchestrateArkadeLoad } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { orchestrateLightningLoad } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'
import type { NetworkMode } from '@/stores/walletStore'

export type RailLoadStartParams = {
  walletId: number
  networkMode: NetworkMode
  /** Defaults to true. Pass false to leave a rail that failed to load in its error state. */
  allowRetryFromError?: boolean
}

/** Starts the Arkade load in the background and reports a failure as a toast. */
export function startArkadeLoadAfterUnlock(params: RailLoadStartParams): void {
  const { walletId, networkMode, allowRetryFromError = true } = params
  if (!isArkadeActiveForNetworkMode(networkMode)) return
  void orchestrateArkadeLoad({ walletId, networkMode, allowRetryFromError }).catch((err) => {
    void import('@/lib/arkade/arkade-session-open-error-toast').then(
      ({ reportArkadeSessionOpenError }) => reportArkadeSessionOpenError(err),
    )
  })
}

/** Starts the Lightning load in the background and reports a failure as a toast. */
export function startLightningLoadAfterUnlock(params: RailLoadStartParams): void {
  const { walletId, networkMode, allowRetryFromError = true } = params
  void orchestrateLightningLoad({ walletId, networkMode, allowRetryFromError }).catch((err) => {
    void import('@/lib/wallet/rail-sync-error-toast').then(({ reportLightningLoadError }) =>
      reportLightningLoadError(err),
    )
  })
}
