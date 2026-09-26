import type { QueryClient } from '@tanstack/react-query'
import {
  ensureMigrated,
  getDatabase,
  persistNewWalletWithSecrets,
  setWalletNoMnemonicBackupFlag,
  type SplitWalletSecretsEncryptedBlobs,
} from '@/db'
import { suggestDefaultWalletName } from '@/lib/wallet/default-wallet-name'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { orchestrateOnchainSetupAfterPersist } from '@/lib/wallet/lifecycle/onchain-setup-lifecycle'
import { orchestrateLock } from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'
import { retryImportInitialEsploraSyncWithWalletStatus } from '@/lib/wallet/wallet-utils'
import { showImportInitialSyncFailureToast } from '@/lib/wallet/wallet-sync-error-toast'
import { invalidateWalletRelatedQueriesAndNotifyOtherTabs } from '@/lib/wallet/wallet-query-cache-sync'
import { ensureWalletSecretsSession } from '@/lib/wallet/wallet-secrets-session'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'
import { startAutoLockTimer } from '@/stores/sessionStore'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { ensureSecretsChannel } from '@/workers/secrets-channel'

export type NewWalletRowInsert = {
  name: string
  createdAt: string
}

export type PersistAndActivateNewWalletParams = {
  encryptedBlobs: SplitWalletSecretsEncryptedBlobs
  firstAddress: string
  markNoMnemonicBackup: boolean
  existingWalletNames: readonly string[]
  insertWalletRow: (walletRow: NewWalletRowInsert) => Promise<number>
  queryClient: QueryClient
}

/**
 * Opens the secrets session and worker channel, then maps the active network
 * for create/import encryption calls.
 */
export async function prepareNewWalletEncryption(
  appPassword: string | undefined,
  networkMode: NetworkMode,
) {
  await ensureWalletSecretsSession(appPassword)
  await ensureSecretsChannel()
  return toBitcoinNetwork(networkMode)
}

function clearStaleDashboardState(): void {
  const walletState = useWalletStore.getState()
  walletState.setBalance(null)
  walletState.setTransactions([])
  walletState.setLastSyncTime(null)
  walletState.setCurrentAddress(null)
}

function activateNewWallet(walletId: number, firstAddress: string): void {
  const walletState = useWalletStore.getState()
  walletState.setActiveWallet(walletId)
  walletState.setCurrentAddress(firstAddress)
  walletState.commitLoadedDescriptorWallet({
    networkMode: walletState.networkMode,
    addressType: walletState.addressType,
    accountId: walletState.accountId,
  })
  walletState.setWalletStatus('unlocked')
  startAutoLockTimer(() => void orchestrateLock())
}

async function runInitialOnchainSetup(walletId: number): Promise<void> {
  const walletState = useWalletStore.getState()
  const { networkMode, addressType, accountId } = walletState
  try {
    await orchestrateOnchainSetupAfterPersist({
      walletId,
      networkMode,
      addressType,
      accountId,
    })
    useWalletStore.getState().setImportInitialSyncErrorMessage(null)
  } catch (setupError: unknown) {
    const syncErrorMessage =
      sanitizeErrorMessageForUi(errorMessage(setupError) ?? String(setupError)) ||
      'Initial sync failed'
    useWalletStore.getState().setImportInitialSyncErrorMessage(syncErrorMessage)
    showImportInitialSyncFailureToast(setupError, () => {
      void retryImportInitialEsploraSyncWithWalletStatus()
    })
  }
}

/**
 * Inserts a wallet row and encrypted secrets, activates it, and runs the
 * initial on-chain setup. Sync failure is recorded and toasted; it does not
 * reject, matching create and import.
 */
export async function persistAndActivateNewWallet(
  params: PersistAndActivateNewWalletParams,
): Promise<number> {
  const {
    encryptedBlobs,
    firstAddress,
    markNoMnemonicBackup,
    existingWalletNames,
    insertWalletRow,
    queryClient,
  } = params

  await ensureMigrated()
  const walletDb = getDatabase()
  let walletId: number
  try {
    walletId = await persistNewWalletWithSecrets({
      walletDb,
      insertWalletRow: () =>
        insertWalletRow({
          name: suggestDefaultWalletName(existingWalletNames),
          createdAt: new Date().toISOString(),
        }),
      encryptedBlobs,
    })
  } catch (secretsError) {
    invalidateWalletRelatedQueriesAndNotifyOtherTabs(queryClient)
    throw secretsError
  }

  if (markNoMnemonicBackup) {
    await setWalletNoMnemonicBackupFlag(walletDb, walletId)
    invalidateWalletRelatedQueriesAndNotifyOtherTabs(queryClient)
  }

  clearStaleDashboardState()
  activateNewWallet(walletId, firstAddress)
  await runInitialOnchainSetup(walletId)
  return walletId
}
