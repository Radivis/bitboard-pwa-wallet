import { useWalletStore } from '@/stores/walletStore'
import { restoreNearZeroSecretsSessionForOperation } from '@/lib/wallet/restore-near-zero-secrets-session'
import { orchestrateBootstrapUnlock } from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import {
  endWalletSecretsSession,
  isWalletSecretsSessionActive,
} from '@/lib/wallet/wallet-secrets-session'
import { reportWalletSyncError } from '@/lib/wallet/wallet-sync-error-toast'

export class WalletUnlockRequiredError extends Error {
  constructor(message = 'Wallet unlock required') {
    super(message)
    this.name = 'WalletUnlockRequiredError'
  }
}

export function isWalletReadyForSecretsAccess(): boolean {
  return walletIsUnlockedOrSyncing(useWalletStore.getState().walletStatus)
}

async function endSecretsSessionAfterFailedAutomaticUnlock(logContext: string): Promise<void> {
  try {
    await endWalletSecretsSession()
  } catch (endSessionError) {
    console.error(logContext, endSessionError)
  }
}

async function restoreNearZeroSessionAndBootstrapIfNeeded(): Promise<void> {
  const restored = await restoreNearZeroSecretsSessionForOperation()
  if (!restored || !(await isWalletSecretsSessionActive())) {
    throw new WalletUnlockRequiredError()
  }

  const {
    activeWalletId,
    networkMode,
    addressType,
    accountId,
    walletStatus,
  } = useWalletStore.getState()

  if (activeWalletId == null) {
    throw new WalletUnlockRequiredError('No active wallet')
  }

  if (!walletIsUnlockedOrSyncing(walletStatus)) {
    try {
      await orchestrateBootstrapUnlock({
        walletId: activeWalletId,
        networkMode,
        addressType,
        accountId,
        onSyncError: (err) => {
          reportWalletSyncError('require-unlocked-wallet', err)
        },
      })
    } catch (bootstrapError) {
      console.error('Automatic wallet bootstrap failed:', bootstrapError)
      await endSecretsSessionAfterFailedAutomaticUnlock(
        'Failed to end secrets session after bootstrap unlock failure:',
      )
      throw new WalletUnlockRequiredError()
    }
  }

  if (!walletIsUnlockedOrSyncing(useWalletStore.getState().walletStatus)) {
    await endSecretsSessionAfterFailedAutomaticUnlock(
      'Failed to end secrets session after bootstrap unlock left the wallet gated:',
    )
    throw new WalletUnlockRequiredError('Wallet could not be unlocked automatically')
  }
}

/**
 * Action-gated operation: unlock before work that needs WASM or wallet secrets
 * on Settings, Lab, and similar non-wallet screens. Tries near-zero restore from
 * SQLite when locked; throws {@link WalletUnlockRequiredError} when the UI must
 * prompt for a password. Does not restore a session merely because those routes
 * are open.
 */
export async function ensureWalletUnlockedForAction(): Promise<void> {
  if (isWalletReadyForSecretsAccess()) {
    return
  }

  await restoreNearZeroSessionAndBootstrapIfNeeded()
}

/** Runs `action` after {@link ensureWalletUnlockedForAction} succeeds. */
export async function runWhenWalletUnlocked(
  action: () => void | Promise<void>,
): Promise<void> {
  await ensureWalletUnlockedForAction()
  await action()
}
