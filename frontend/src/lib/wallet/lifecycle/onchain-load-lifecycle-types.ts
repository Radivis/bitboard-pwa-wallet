import type { AddressType, NetworkMode } from '@/stores/walletStore'
import type { LoadLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export type OnchainLoadLifecycleSnapshot = {
  loadPhase: LoadLifecyclePhase
  /** Set when the rail leaves not-configured; used for lab sync stub derivation. */
  networkMode: NetworkMode | null
}

export type OnchainLoadParams = {
  walletId: number
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
  /** When true, clears `lastSyncTime` before WASM load (Esplora unlock path). Important when switching descriptor wallets.*/
  clearLastSyncTime?: boolean
}
