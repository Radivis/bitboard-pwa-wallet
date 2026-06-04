import { useFeatureStore } from '@/stores/featureStore'
import {
  getCommittedNetworkMode,
  type NetworkMode,
} from '@/stores/walletStore'
import {
  getArkadeEndpoints,
  isArkadeSupportedNetworkMode,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'

export function isArkadeFeatureEnabled(): boolean {
  return useFeatureStore.getState().isArkadeEnabled
}

export function isArkadeActiveForNetworkMode(networkMode: NetworkMode): boolean {
  if (!useFeatureStore.getState().isArkadeEnabled) return false
  if (!isArkadeSupportedNetworkMode(networkMode)) return false
  if (networkMode === 'mainnet' && !useFeatureStore.getState().isMainnetAccessEnabled) {
    return false
  }
  return true
}

export function isArkadeActiveForCommittedNetwork(): boolean {
  return isArkadeActiveForNetworkMode(getCommittedNetworkMode())
}

export function requireArkadeSupportedNetworkMode(
  networkMode: NetworkMode,
): ArkadeSupportedNetworkMode {
  if (!isArkadeSupportedNetworkMode(networkMode)) {
    throw new Error(`Arkade is not available on network: ${networkMode}`)
  }
  return networkMode
}

export function getCommittedArkadeEndpoints() {
  const mode = requireArkadeSupportedNetworkMode(getCommittedNetworkMode())
  return getArkadeEndpoints(mode)
}
