import type { ArkadeSyncKind } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-types'

/** Manual sync and signer migration ask WASM to mark a background full list due. */
export function operatorSyncSchedulesBackgroundFull(syncKind: ArkadeSyncKind): boolean {
  return syncKind === 'manual' || syncKind === 'signerMigration'
}

/**
 * Post-load schedules gap restore once per session. Manual sync schedules it again.
 * Dashboard poll and signer migration do not. Bootstrap syncs that already ran
 * discover_keys (`skippedKeyDiscovery` not true) do not schedule another restore.
 */
export function shouldScheduleBackgroundKeyDiscovery(
  syncKind: ArkadeSyncKind,
  alreadyScheduledThisSession: boolean,
  skippedKeyDiscovery: boolean | undefined,
): boolean {
  if (skippedKeyDiscovery !== true) {
    return false
  }
  if (syncKind === 'manual') {
    return true
  }
  if (syncKind === 'postLoad') {
    return !alreadyScheduledThisSession
  }
  return false
}

/** Schedule only when user-facing sync says a background full list is due (includes bootstrap = false). */
export function shouldScheduleBackgroundFullVtxoReconcile(
  fullReconcileDue: boolean | undefined,
): boolean {
  return fullReconcileDue === true
}

/** Persist-after-board/intent: light operator sync only; never await the background full list. */
export async function persistAfterCriticalWithLightOperatorSync(params: {
  awaitUserFacingQuiescence: () => Promise<void>
  autonomousActive: boolean
  runLightOperatorSync: () => Promise<{ fullReconcileDue?: boolean }>
  scheduleBackgroundFullReconcile: () => void
  flushPersistence: () => Promise<void>
}): Promise<void> {
  await params.awaitUserFacingQuiescence()
  if (!params.autonomousActive) {
    const result = await params.runLightOperatorSync()
    if (shouldScheduleBackgroundFullVtxoReconcile(result.fullReconcileDue)) {
      params.scheduleBackgroundFullReconcile()
    }
    return
  }
  await params.flushPersistence()
}
