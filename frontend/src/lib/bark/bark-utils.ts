import { isE2eBarkRegtestControlEnabled } from '@/lib/bark/e2e/bark-regtest-env'
import type { BarkRailNetwork } from '@/lib/wallet/wallet-domain-types'
import { useFeatureStore } from '@/stores/featureStore'
import type { NetworkMode } from '@/stores/walletStore'

export function isBarkFeatureEnabled(): boolean {
  return useFeatureStore.getState().isBarkEnabled
}

/**
 * Signet and Mainnet are the product Bark networks.
 * Regtest counts only while the Playwright flag is on.
 */
export function isBarkNetworkMode(
  networkMode: NetworkMode,
): networkMode is BarkRailNetwork {
  if (networkMode === 'signet' || networkMode === 'mainnet') return true
  return networkMode === 'regtest' && isE2eBarkRegtestControlEnabled()
}

/** A Bark session runs only while the feature is on and the network is a Bark network. */
export function isBarkActiveForNetworkMode(
  networkMode: NetworkMode,
): networkMode is BarkRailNetwork {
  return isBarkFeatureEnabled() && isBarkNetworkMode(networkMode)
}
