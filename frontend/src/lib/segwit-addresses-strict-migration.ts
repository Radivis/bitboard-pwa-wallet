import { toast } from 'sonner'
import { executeSettingsAddressTypeSwitch } from '@/lib/execute-settings-address-type-switch'
import { errorMessage } from '@/lib/utils'
import { useFeatureStore } from '@/stores/featureStore'
import {
  AddressType,
  getCommittedAddressType,
  useWalletStore,
} from '@/stores/walletStore'

/** Prevents duplicate concurrent runs (e.g. React Strict Mode double effect). */
let segwitAddressesStrictMigrationStarted = false

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
 * When SegWit address options are off, any persisted SegWit preference is moved to Taproot once after hydration.
 */
export function runSegwitAddressesStrictMigrationAfterHydration(): void {
  if (segwitAddressesStrictMigrationStarted) return
  segwitAddressesStrictMigrationStarted = true

  void (async () => {
    try {
      await Promise.all([
        waitForStoreHydration(useWalletStore),
        waitForStoreHydration(useFeatureStore),
      ])

      const { segwitAddressesEnabled } = useFeatureStore.getState()
      if (segwitAddressesEnabled) return
      if (getCommittedAddressType() !== AddressType.SegWit) return

      try {
        await executeSettingsAddressTypeSwitch({
          targetAddressType: AddressType.Taproot,
        })
        toast.info(
          'SegWit addresses are off in Settings → Features. Switched receiving to Taproot (BIP86).',
        )
      } catch (err) {
        segwitAddressesStrictMigrationStarted = false
        toast.error(
          errorMessage(err) ??
            'Could not switch to Taproot. Enable “SegWit addresses” in Settings → Features or try again.',
        )
      }
    } catch {
      segwitAddressesStrictMigrationStarted = false
    }
  })()
}
