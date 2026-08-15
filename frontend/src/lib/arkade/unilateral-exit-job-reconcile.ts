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
  if (params.unilateralExitInProgressSats > 0 && params.inProgressOutpoints.length === 0) {
    return true
  }
  if (params.inProgressOutpoints.length > 0 || params.unilateralExitInProgressSats > 0) {
    return false
  }
  if (params.arkadeLoadPhase !== 'loaded') {
    return true
  }
  return params.arkadeSyncPhase === 'syncing'
}

/**
 * True when SQLite still has an active job but WASM reports no in-progress exit.
 * Intermediate (en-passant) VTXOs can differ from the original job leaves, so
 * non-overlapping outpoints are not treated as stale while sats remain in progress.
 */
export function isPersistedUnilateralExitJobStale(params: {
  jobStarted: boolean
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  inProgressOutpoints: ArkadeVtxoOutpoint[]
  unilateralExitInProgressSats: number
}): boolean {
  if (!params.jobStarted) {
    return false
  }

  if (params.selectedLeafOutpoints.length === 0) {
    return true
  }

  const hasInProgressExits =
    params.unilateralExitInProgressSats > 0 || params.inProgressOutpoints.length > 0

  return !hasInProgressExits
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

  return true
}
