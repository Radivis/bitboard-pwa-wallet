import { getDatabase, tryLoadNearZeroSessionIntoMemory } from '@/db'
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

async function restoreNearZeroSessionAndBootstrapIfNeeded(): Promise<void> {
  const restored = await tryLoadNearZeroSessionIntoMemory(getDatabase())
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
 * Tries near-zero restore from SQLite when locked; throws
 * {@link WalletUnlockRequiredError} when the UI must prompt for a password.
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
