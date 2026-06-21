import { useSyncExternalStore } from 'react'
import type { DashboardRailId } from '@/components/wallet/RailSyncControl'
import { useFeatureStore } from '@/stores/featureStore'
import { usePeriodicSyncStore } from '@/stores/periodicSyncStore'
import { useWalletStore } from '@/stores/walletStore'
import {
  isDocumentVisibleForPeriodicSync,
  resolvePeriodicSyncRefetchIntervalMs,
} from '@/lib/wallet/periodic-sync/resolve-periodic-sync-refetch-interval'

function subscribeDocumentVisibility(onStoreChange: () => void): () => void {
  if (typeof document === 'undefined') {
    return () => {}
  }
  document.addEventListener('visibilitychange', onStoreChange)
  return () => document.removeEventListener('visibilitychange', onStoreChange)
}

function getDocumentVisibilitySnapshot(): DocumentVisibilityState {
  if (typeof document === 'undefined') {
    return 'hidden'
  }
  return document.visibilityState
}

/**
 * React Query refetchInterval for a rail when periodic sync is enabled and the tab is visible.
 */
export function usePeriodicSyncRefetchInterval(rail: DashboardRailId): number | false {
  const isPeriodicSyncEnabled = useFeatureStore(
    (featureState) => featureState.isPeriodicSyncEnabled,
  )
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const isArkadeEnabled = useFeatureStore((featureState) => featureState.isArkadeEnabled)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const rails = usePeriodicSyncStore((periodicSyncState) => periodicSyncState.rails)
  const documentVisibilityState = useSyncExternalStore(
    subscribeDocumentVisibility,
    getDocumentVisibilitySnapshot,
    () => 'visible' as DocumentVisibilityState,
  )

  return resolvePeriodicSyncRefetchIntervalMs({
    rail,
    isPeriodicSyncEnabled,
    isLightningEnabled,
    isArkadeEnabled,
    networkMode,
    rails,
    documentVisibilityState,
  })
}

/**
 * Non-hook resolver for React Query refetchInterval callbacks that read store snapshots.
 */
export function getPeriodicSyncRefetchIntervalMs(rail: DashboardRailId): number | false {
  const featureState = useFeatureStore.getState()
  const periodicSyncState = usePeriodicSyncStore.getState()
  const networkMode = useWalletStore.getState().networkMode

  return resolvePeriodicSyncRefetchIntervalMs({
    rail,
    isPeriodicSyncEnabled: featureState.isPeriodicSyncEnabled,
    isLightningEnabled: featureState.isLightningEnabled,
    isArkadeEnabled: featureState.isArkadeEnabled,
    networkMode,
    rails: periodicSyncState.rails,
    documentVisibilityState: isDocumentVisibleForPeriodicSync()
      ? 'visible'
      : 'hidden',
  })
}
