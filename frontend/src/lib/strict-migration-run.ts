import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore } from '@/stores/walletStore'
import { waitForPersistedStoreHydration } from '@/lib/persisted-store-hydration'

export async function waitForWalletAndFeatureStoresHydrated(): Promise<void> {
  await Promise.all([
    waitForPersistedStoreHydration(useWalletStore),
    waitForPersistedStoreHydration(useFeatureStore),
  ])
}

/**
 * One-shot migration job after wallet + feature stores are hydrated.
 * Resets `guard.started` on unexpected failure so the job can retry (e.g. Strict Mode).
 */
export function runStrictMigrationAfterHydration(
  guard: { started: boolean },
  work: () => Promise<void>,
): void {
  if (guard.started) return
  guard.started = true
  void (async () => {
    try {
      await waitForWalletAndFeatureStoresHydrated()
      await work()
    } catch {
      guard.started = false
    }
  })()
}
