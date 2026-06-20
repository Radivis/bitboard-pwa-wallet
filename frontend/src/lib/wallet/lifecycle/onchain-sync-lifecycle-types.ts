import type { AddressType, NetworkMode } from '@/stores/walletStore'
import type { SyncLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { OnchainRailDescriptorScope } from '@/lib/wallet/lifecycle/onchain-rail-types'
import type { OnchainSaveParams } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'
import type { BitcoinNetwork } from '@/workers/crypto-types'

export type OnchainSyncKind =
  | 'postUnlock'
  | 'incrementalDashboard'
  | 'fullRescanDashboard'
  | 'descriptorSwitch'
  | 'importInitial'
  | 'postBroadcast'

export type OnchainSyncLifecycleSnapshot = {
  syncPhase: SyncLifecyclePhase
  descriptorScope: OnchainRailDescriptorScope | null
}

export type OnchainSyncParams = {
  walletId: number
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
  syncKind: OnchainSyncKind
  useFullScan?: boolean
  markFullScanDone?: boolean
  descriptorWalletCoordinates?: {
    network: BitcoinNetwork
    addressType: AddressType
    accountId: number
  }
  onSyncError?: (err: unknown) => void
  awaitCompletion?: boolean
  arkadeSessionOpenPromise?: Promise<void> | null
  /** When false, sync/save errors do not throw (background post-unlock). */
  throwOnError?: boolean
}

export type OnchainSyncThenSaveParams = OnchainSyncParams

export type OnchainPostUnlockSyncParams = {
  walletId: number
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
  onSyncError?: (err: unknown) => void
  awaitCompletion?: boolean
  arkadeSessionOpenPromise?: Promise<void> | null
}

export type OnchainSaveParamsFromSync = OnchainSaveParams
