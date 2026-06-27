import {
  awaitArkadeSyncQuiescence,
  scheduleBackgroundArkadeOperatorSync as scheduleBackgroundArkadeOperatorSyncFromLifecycle,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'

/** Serialize critical persistence with dashboard background operator sync. */
export async function awaitBackgroundArkadeOperatorSync(): Promise<void> {
  await awaitArkadeSyncQuiescence()
}

export function scheduleBackgroundArkadeOperatorSync(): void {
  scheduleBackgroundArkadeOperatorSyncFromLifecycle()
}
