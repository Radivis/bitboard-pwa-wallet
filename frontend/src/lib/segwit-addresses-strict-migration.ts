import { toast } from 'sonner'
import { executeSettingsAddressTypeSwitch } from '@/lib/execute-settings-address-type-switch'
import { errorMessage } from '@/lib/utils'
import { runStrictMigrationAfterHydration } from '@/lib/strict-migration-run'
import { useFeatureStore } from '@/stores/featureStore'
import {
  AddressType,
  getCommittedAddressType,
} from '@/stores/walletStore'

const segwitAddressesStrictMigrationGuard = { started: false }

/**
 * When SegWit address options are off, any persisted SegWit preference is moved to Taproot once after hydration.
 */
export function runSegwitAddressesStrictMigrationAfterHydration(): void {
  runStrictMigrationAfterHydration(
    segwitAddressesStrictMigrationGuard,
    async () => {
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
        segwitAddressesStrictMigrationGuard.started = false
        toast.error(
          errorMessage(err) ??
            'Could not switch to Taproot. Enable “SegWit addresses” in Settings → Features or try again.',
        )
      }
    },
  )
}
