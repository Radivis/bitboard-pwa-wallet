import { getDatabase, tryLoadNearZeroSessionIntoMemory } from '@/db'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { useWalletStore } from '@/stores/walletStore'
import { orchestrateBootstrapUnlock } from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { isWalletSecretsSessionActive } from '@/lib/wallet/wallet-secrets-session'
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

async function ensureNearZeroWalletUnlockedForAction(): Promise<void> {
  const restored = await tryLoadNearZeroSessionIntoMemory(getDatabase())
  if (!restored || !(await isWalletSecretsSessionActive())) {
    throw new WalletUnlockRequiredError('Near-zero session could not be restored')
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
    await orchestrateBootstrapUnlock({
      walletId: activeWalletId,
      networkMode,
      addressType,
      accountId,
      onSyncError: (err) => {
        reportWalletSyncError('require-unlocked-wallet', err)
      },
    })
  }

  if (!walletIsUnlockedOrSyncing(useWalletStore.getState().walletStatus)) {
    throw new WalletUnlockRequiredError('Wallet could not be unlocked automatically')
  }
}

/**
 * Ensures the wallet is unlocked before imperative work on non-wallet routes.
 * Throws {@link WalletUnlockRequiredError} when the UI must prompt for a password.
 */
export async function ensureWalletUnlockedForAction(): Promise<void> {
  if (isWalletReadyForSecretsAccess()) {
    return
  }

  if (useNearZeroSecurityStore.getState().active) {
    await ensureNearZeroWalletUnlockedForAction()
    return
  }

  throw new WalletUnlockRequiredError()
}

/** Runs `action` after {@link ensureWalletUnlockedForAction} succeeds. */
export async function runWhenWalletUnlocked(
  action: () => void | Promise<void>,
): Promise<void> {
  await ensureWalletUnlockedForAction()
  await action()
}
