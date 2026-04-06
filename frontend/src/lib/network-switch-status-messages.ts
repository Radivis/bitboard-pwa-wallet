import {
  ADDRESS_TYPE_LABELS,
  NETWORK_LABELS,
  type AddressType,
  type NetworkMode,
} from '@/stores/walletStore'

/** Shown while persisting the current WASM wallet state for the previous network. */
export function savingPreviousNetworkMessage(network: NetworkMode): string {
  return `Switching network: Saving ${NETWORK_LABELS[network]} data`
}

/** Shown while resolving descriptors and loading the target sub-wallet into WASM. */
export function loadingTargetNetworkMessage(network: NetworkMode): string {
  return `Switching network: Loading ${NETWORK_LABELS[network]} data`
}

/** Shown while Esplora sync runs for the target network (not used for lab). */
export function syncingTargetNetworkMessage(network: NetworkMode): string {
  return `Updating network: Syncing with ${NETWORK_LABELS[network]}`
}

/** Shown while persisting the current sub-wallet for the previous address type. */
export function savingPreviousAddressTypeMessage(addressType: AddressType): string {
  return `Switching address type: Saving ${ADDRESS_TYPE_LABELS[addressType]} wallet data`
}

/** Shown while loading the target address type’s descriptor wallet into WASM. */
export function loadingTargetAddressTypeMessage(addressType: AddressType): string {
  return `Switching address type: Loading ${ADDRESS_TYPE_LABELS[addressType]} wallet data`
}

export type NetworkSwitchPhaseReporter = (message: string) => void
