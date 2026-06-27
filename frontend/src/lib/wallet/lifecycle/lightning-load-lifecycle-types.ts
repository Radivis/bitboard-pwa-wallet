import type { NetworkMode } from '@/stores/walletStore'
import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export type LightningLoadLifecycleSnapshot = {
  loadPhase: LoadLifecyclePhase
  networkMode: NetworkMode | null
  errorMessage: string | null
}

export type LightningLoadParams = {
  walletId: number
  networkMode: NetworkMode
  /** When true, allows load to proceed from `load-error` (unlock retry path). */
  allowRetryFromError?: boolean
}
