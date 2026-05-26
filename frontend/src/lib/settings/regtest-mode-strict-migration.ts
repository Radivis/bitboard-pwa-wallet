import { toast } from 'sonner'
import { executeSettingsNetworkSwitch } from '@/lib/settings/network-mode-switch'
import { errorMessage } from '@/lib/shared/utils'
import { runStrictMigrationAfterHydration } from '@/lib/settings/strict-migration-run'
import { useFeatureStore } from '@/stores/featureStore'
import { getCommittedNetworkMode } from '@/stores/walletStore'

const regtestStrictMigrationGuard = { started: false }

/**
 * If Regtest mode is off in Settings → Features but persisted network is Regtest,
 * switch to Testnet once after hydration (user cannot select Regtest while the flag is off).
 */
export function runRegtestStrictMigrationAfterHydration(): void {
  runStrictMigrationAfterHydration(regtestStrictMigrationGuard, async () => {
    const { regtestModeEnabled } = useFeatureStore.getState()
    if (regtestModeEnabled) return

    if (getCommittedNetworkMode() !== 'regtest') return

    try {
      await executeSettingsNetworkSwitch({ targetNetwork: 'testnet' })
      toast.info(
        'Regtest mode is off in Settings → Features. Switched to Testnet.',
      )
    } catch (err) {
      regtestStrictMigrationGuard.started = false
      toast.error(
        errorMessage(err) ??
          'Could not leave Regtest. Enable Regtest mode in Settings → Features or try again.',
      )
    }
  })
}
