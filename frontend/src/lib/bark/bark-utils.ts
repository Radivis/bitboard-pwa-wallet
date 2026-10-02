import { useFeatureStore } from '@/stores/featureStore'
import type { NetworkMode } from '@/stores/walletStore'

export function isBarkFeatureEnabled(): boolean {
  return useFeatureStore.getState().isBarkEnabled
}

/** Signet and Mainnet are the Bark networks this app opens. */
export function isBarkNetworkMode(
  networkMode: NetworkMode,
): networkMode is 'signet' | 'mainnet' {
  return networkMode === 'signet' || networkMode === 'mainnet'
}

/** A Bark session runs only while the flag is on and the app is on Signet or Mainnet. */
export function isBarkActiveForNetworkMode(networkMode: NetworkMode): boolean {
  return isBarkFeatureEnabled() && isBarkNetworkMode(networkMode)
}
