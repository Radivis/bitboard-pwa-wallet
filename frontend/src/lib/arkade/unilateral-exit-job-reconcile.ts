import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { includesArkadeVtxoOutpoint } from '@/workers/arkade-api'

export function selectedOutpointsOverlapInProgress(
  selectedLeafOutpoints: ArkadeVtxoOutpoint[],
  inProgressOutpoints: ArkadeVtxoOutpoint[],
): boolean {
  return selectedLeafOutpoints.some((outpoint) =>
    includesArkadeVtxoOutpoint(inProgressOutpoints, outpoint),
  )
}

/**
 * Defer stale-job clearing while Arkade may still be syncing in-progress exit state.
 * Avoids wiping a persisted job on the first empty in-progress snapshot after reload.
 */
export function shouldDeferPersistedUnilateralExitStaleCheck(params: {
  jobStarted: boolean
  inProgressOutpoints: ArkadeVtxoOutpoint[]
  unilateralExitInProgressSats: number
  arkadeLoadPhase: 'not-configured' | 'loading' | 'loaded' | 'load-error'
  arkadeSyncPhase: 'not-configured' | 'not-syncing' | 'syncing' | 'sync-error'
}): boolean {
  if (!params.jobStarted) {
    return false
  }
  if (params.inProgressOutpoints.length > 0 || params.unilateralExitInProgressSats > 0) {
    return false
  }
  if (params.arkadeLoadPhase !== 'loaded') {
    return true
  }
  return params.arkadeSyncPhase === 'syncing'
}

/** True when SQLite still has an active job but WASM reports no matching in-progress exit. */
export function isPersistedUnilateralExitJobStale(params: {
  jobStarted: boolean
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  inProgressOutpoints: ArkadeVtxoOutpoint[]
  unilateralExitInProgressSats: number
}): boolean {
  if (!params.jobStarted) {
    return false
  }

  const hasInProgressExits =
    params.unilateralExitInProgressSats > 0 || params.inProgressOutpoints.length > 0

  if (!hasInProgressExits) {
    return true
  }

  if (params.selectedLeafOutpoints.length === 0) {
    return true
  }

  return !selectedOutpointsOverlapInProgress(
    params.selectedLeafOutpoints,
    params.inProgressOutpoints,
  )
}

/** Restore control-store selection from SQLite only for a still-active exit job. */
export function shouldHydratePersistedUnilateralExitJob(params: {
  jobStarted: boolean
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  inProgressOutpoints: ArkadeVtxoOutpoint[]
  unilateralExitInProgressSats: number
  controlStoreSelectionEmpty: boolean
}): boolean {
  if (!params.jobStarted || params.selectedLeafOutpoints.length === 0) {
    return false
  }
  if (!params.controlStoreSelectionEmpty) {
    return false
  }
  if (
    isPersistedUnilateralExitJobStale({
      jobStarted: params.jobStarted,
      selectedLeafOutpoints: params.selectedLeafOutpoints,
      inProgressOutpoints: params.inProgressOutpoints,
      unilateralExitInProgressSats: params.unilateralExitInProgressSats,
    })
  ) {
    return false
  }

  return selectedOutpointsOverlapInProgress(
    params.selectedLeafOutpoints,
    params.inProgressOutpoints,
  )
}
