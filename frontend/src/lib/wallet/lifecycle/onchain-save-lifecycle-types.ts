import type { AddressType, NetworkMode } from '@/stores/walletStore'
import type { SaveLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { OnchainRailDescriptorScope } from '@/lib/wallet/lifecycle/onchain-rail-types'
import type { BitcoinNetwork } from '@/workers/crypto-types'

export type OnchainSaveLifecycleSnapshot = {
  savePhase: SaveLifecyclePhase
  errorMessage: string | null
  descriptorScope: OnchainRailDescriptorScope | null
}

export type OnchainSaveParams = {
  walletId: number
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
  markFullScanDone?: boolean
  descriptorWalletCoordinates?: {
    network: BitcoinNetwork
    addressType: AddressType
    accountId: number
  }
}
