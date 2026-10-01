import { useFeatureStore } from '@/stores/featureStore'
import type { NetworkMode } from '@/stores/walletStore'

export function isBarkFeatureEnabled(): boolean {
  return useFeatureStore.getState().isBarkEnabled
}

/** Bark's public Signet session runs only while the flag is on and the app is in signet mode. */
export function isBarkActiveForNetworkMode(networkMode: NetworkMode): boolean {
  return isBarkFeatureEnabled() && networkMode === 'signet'
}
