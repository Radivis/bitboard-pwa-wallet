import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { includesArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { persistedUnilateralExitJobExists } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'

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
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  inProgressOutpoints: ArkadeVtxoOutpoint[]
  unilateralExitInProgressSats: number
  arkadeLoadPhase: 'not-configured' | 'loading' | 'loaded' | 'load-error'
  arkadeSyncPhase: 'not-configured' | 'not-syncing' | 'syncing' | 'sync-error'
}): boolean {
  if (!persistedUnilateralExitJobExists(params)) {
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
 * True when SQLite still has a job bookmark but WASM reports no in-progress exit.
 * Intermediate (en-passant) VTXOs can differ from the original job leaves, so
 * non-overlapping outpoints are not treated as stale while sats remain in progress.
 */
export function isPersistedUnilateralExitJobStale(params: {
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  inProgressOutpoints: ArkadeVtxoOutpoint[]
  unilateralExitInProgressSats: number
}): boolean {
  if (!persistedUnilateralExitJobExists(params)) {
    return false
  }

  const hasInProgressExits =
    params.unilateralExitInProgressSats > 0 || params.inProgressOutpoints.length > 0

  return !hasInProgressExits
}

/** Restore control-store selection from SQLite only for a still-present exit job. */
export function shouldHydratePersistedUnilateralExitJob(params: {
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  inProgressOutpoints: ArkadeVtxoOutpoint[]
  unilateralExitInProgressSats: number
  controlStoreSelectionEmpty: boolean
}): boolean {
  if (!persistedUnilateralExitJobExists(params)) {
    return false
  }
  if (!params.controlStoreSelectionEmpty) {
    return false
  }
  if (
    isPersistedUnilateralExitJobStale({
      selectedLeafOutpoints: params.selectedLeafOutpoints,
      inProgressOutpoints: params.inProgressOutpoints,
      unilateralExitInProgressSats: params.unilateralExitInProgressSats,
    })
  ) {
    return false
  }

  return true
}
