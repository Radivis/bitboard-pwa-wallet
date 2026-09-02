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
 * Defer hydrate while Arkade may still be syncing in-progress exit state.
 * Avoids starting the machine on the first empty in-progress snapshot after reload.
 */
export function shouldDeferPersistedUnilateralExitHydrate(params: {
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
 * Restore control-store selection from SQLite only for a still-present exit job.
 * A persisted bookmark is crash recovery, including `START_MANUAL` before the first
 * unroll tx is visible on chain. WASM reporting no in-progress exits is not a reason
 * to skip hydrate — complete / abort / terminate already clear the bookmark.
 */
export function shouldHydratePersistedUnilateralExitJob(params: {
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  controlStoreSelectionEmpty: boolean
}): boolean {
  if (!persistedUnilateralExitJobExists(params)) {
    return false
  }
  if (!params.controlStoreSelectionEmpty) {
    return false
  }
  return true
}

export function shouldLockUnilateralExitLeafSelection(params: {
  lifecycleJobActive: boolean
  persistedJobExists: boolean
}): boolean {
  return params.lifecycleJobActive || params.persistedJobExists
}

export function canSelectUnilateralExitLeafForUnroll(params: {
  leafOutpoints: ArkadeVtxoOutpoint[]
  startableOutpoints: ArkadeVtxoOutpoint[]
  selectionLocked: boolean
}): boolean {
  if (params.selectionLocked || params.leafOutpoints.length === 0) {
    return false
  }
  return params.leafOutpoints.every((outpoint) =>
    includesArkadeVtxoOutpoint(params.startableOutpoints, outpoint),
  )
}
