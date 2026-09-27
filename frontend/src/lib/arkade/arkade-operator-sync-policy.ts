import type { ArkadeSyncKind } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-types'

/** Manual sync and signer migration ask WASM to mark a background full list due. */
export function operatorSyncSchedulesBackgroundFull(syncKind: ArkadeSyncKind): boolean {
  return syncKind === 'manual' || syncKind === 'signerMigration'
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
