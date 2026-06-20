import type { NetworkMode } from '@/stores/walletStore'
import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export type ArkadeLoadLifecycleSnapshot = {
  loadPhase: LoadLifecyclePhase
  networkMode: NetworkMode | null
}

export type ArkadeLoadParams = {
  walletId: number
  networkMode: NetworkMode
}
