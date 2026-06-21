import type { DashboardRailId } from '@/components/wallet/RailSyncControl'
import type { NetworkMode } from '@/stores/walletStore'
import type { PeriodicSyncRailState } from '@/stores/periodicSyncStore'

export type PeriodicSyncResolverInput = {
  rail: DashboardRailId
  isPeriodicSyncEnabled: boolean
  isLightningEnabled: boolean
  isArkadeEnabled: boolean
  networkMode: NetworkMode
  rails: PeriodicSyncRailState
  documentVisibilityState?: DocumentVisibilityState
}

export function resolvePeriodicSyncRefetchIntervalMs(
  input: PeriodicSyncResolverInput,
): number | false {
  if (!input.isPeriodicSyncEnabled) {
    return false
  }

  const railSettings = input.rails[input.rail]
  if (!railSettings.isEnabled) {
    return false
  }

  if (input.rail === 'onchain' && input.networkMode === 'lab') {
    return false
  }

  if (input.rail === 'lightning' && !input.isLightningEnabled) {
    return false
  }

  if (input.rail === 'arkade' && !input.isArkadeEnabled) {
    return false
  }

  if (
    input.documentVisibilityState != null &&
    input.documentVisibilityState !== 'visible'
  ) {
    return false
  }

  return railSettings.intervalSeconds * 1000
}

export function isDocumentVisibleForPeriodicSync(): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  return document.visibilityState === 'visible'
}
