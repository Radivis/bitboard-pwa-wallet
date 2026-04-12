import { toast } from 'sonner'
import { executeSettingsNetworkSwitch } from '@/lib/network-mode-switch'
import { errorMessage } from '@/lib/utils'
import { useFeatureStore } from '@/stores/featureStore'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

/** Prevents duplicate concurrent runs (e.g. React Strict Mode double effect). */
let mainnetStrictMigrationStarted = false

function waitForStoreHydration(
  store: typeof useWalletStore | typeof useFeatureStore,
): Promise<void> {
  return new Promise((resolve) => {
    if (store.persist.hasHydrated()) {
      resolve()
      return
    }
    const unsub = store.persist.onFinishHydration(() => {
      unsub()
      resolve()
    })
  })
}

/**
 * Strict policy: Mainnet is unavailable until the user enables it under Settings → Features.
 * If persisted state still has Mainnet while access is off, switch to Testnet once after hydration.
 */
export function runMainnetStrictMigrationAfterHydration(): void {
  if (mainnetStrictMigrationStarted) return
  mainnetStrictMigrationStarted = true

  void (async () => {
    try {
      await Promise.all([
        waitForStoreHydration(useWalletStore),
        waitForStoreHydration(useFeatureStore),
      ])

      const { mainnetAccessEnabled } = useFeatureStore.getState()
      if (mainnetAccessEnabled) return

      if (getCommittedNetworkMode() !== 'mainnet') return

      try {
        await executeSettingsNetworkSwitch({ targetNetwork: 'testnet' })
        toast.info(
          'Mainnet access is off in Settings → Features. Switched to Testnet.',
        )
      } catch (err) {
        mainnetStrictMigrationStarted = false
        toast.error(
          errorMessage(err) ??
            'Could not leave Mainnet. Enable Mainnet access in Settings → Features or try again.',
        )
      }
    } catch {
      mainnetStrictMigrationStarted = false
    }
  })()
}
