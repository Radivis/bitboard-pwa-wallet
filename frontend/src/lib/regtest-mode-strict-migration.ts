import { toast } from 'sonner'
import { executeSettingsNetworkSwitch } from '@/lib/network-mode-switch'
import { errorMessage } from '@/lib/utils'
import { useFeatureStore } from '@/stores/featureStore'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

/** Prevents duplicate concurrent runs (e.g. React Strict Mode double effect). */
let regtestStrictMigrationStarted = false

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
 * If Regtest mode is off in Settings → Features but persisted network is Regtest,
 * switch to Testnet once after hydration (user cannot select Regtest while the flag is off).
 */
export function runRegtestStrictMigrationAfterHydration(): void {
  if (regtestStrictMigrationStarted) return
  regtestStrictMigrationStarted = true

  void (async () => {
    try {
      await Promise.all([
        waitForStoreHydration(useWalletStore),
        waitForStoreHydration(useFeatureStore),
      ])

      const { regtestModeEnabled } = useFeatureStore.getState()
      if (regtestModeEnabled) return

      if (getCommittedNetworkMode() !== 'regtest') return

      try {
        await executeSettingsNetworkSwitch({ targetNetwork: 'testnet' })
        toast.info(
          'Regtest mode is off in Settings → Features. Switched to Testnet.',
        )
      } catch (err) {
        regtestStrictMigrationStarted = false
        toast.error(
          errorMessage(err) ??
            'Could not leave Regtest. Enable Regtest mode in Settings → Features or try again.',
        )
      }
    } catch {
      regtestStrictMigrationStarted = false
    }
  })()
}
