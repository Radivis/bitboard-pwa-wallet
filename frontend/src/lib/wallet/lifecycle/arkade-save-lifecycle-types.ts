import type { NetworkMode } from '@/stores/walletStore'
import type { SaveLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { ArkadeRailScope } from '@/lib/wallet/lifecycle/arkade-rail-types'

export type ArkadeSaveLifecycleSnapshot = {
  savePhase: SaveLifecyclePhase
  errorMessage: string | null
  railScope: ArkadeRailScope | null
}

export type ArkadeSaveParams = {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
}
