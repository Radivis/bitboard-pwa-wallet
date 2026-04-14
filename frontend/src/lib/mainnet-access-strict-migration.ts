import { toast } from 'sonner'
import { executeSettingsNetworkSwitch } from '@/lib/network-mode-switch'
import { errorMessage } from '@/lib/utils'
import { runStrictMigrationAfterHydration } from '@/lib/strict-migration-run'
import { useFeatureStore } from '@/stores/featureStore'
import { getCommittedNetworkMode } from '@/stores/walletStore'

const mainnetStrictMigrationGuard = { started: false }

/**
 * Strict policy: Mainnet is unavailable until the user enables it under Settings → Features.
 * If persisted state still has Mainnet while access is off, switch to Testnet once after hydration.
 */
export function runMainnetStrictMigrationAfterHydration(): void {
  runStrictMigrationAfterHydration(mainnetStrictMigrationGuard, async () => {
    const { mainnetAccessEnabled } = useFeatureStore.getState()
    if (mainnetAccessEnabled) return

    if (getCommittedNetworkMode() !== 'mainnet') return

    try {
      await executeSettingsNetworkSwitch({ targetNetwork: 'testnet' })
      toast.info(
        'Mainnet access is off in Settings → Features. Switched to Testnet.',
      )
    } catch (err) {
      mainnetStrictMigrationGuard.started = false
      toast.error(
        errorMessage(err) ??
          'Could not leave Mainnet. Enable Mainnet access in Settings → Features or try again.',
      )
    }
  })
}
