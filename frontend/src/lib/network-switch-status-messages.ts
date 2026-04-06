import { NETWORK_LABELS, type NetworkMode } from '@/stores/walletStore'

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

export type NetworkSwitchPhaseReporter = (message: string) => void
