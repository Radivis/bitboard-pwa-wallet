import { toast } from 'sonner'

import { getDatabase, ensureMigrated } from '@/db/database'
import type { NetworkMode } from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { asBadLocalChainStateError } from '@/lib/shared/bad-local-chain-state-error'
import { withEsploraFullScanRetries } from '@/lib/esplora/esplora-full-scan-retry'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { showImportInitialSyncFailureToast } from '@/lib/wallet/wallet-sync-error-toast'
import {
  getEsploraUrl,
  toBitcoinNetwork,
  validateEsploraUrl,
} from '@/lib/wallet/bitcoin-utils'
import { errorMessage, userFacingLifecycleErrorMessage } from '@/lib/shared/utils'
import { withPersistedChainMismatchRetry } from '@/lib/wallet/persisted-chain-mismatch'
import type { LoadWalletParams } from '@/workers/crypto-api'
import type { AddressType, BitcoinNetwork } from '@/workers/crypto-types'
import {
  updateDescriptorWalletChangeset,
  resolveDescriptorWallet,
} from '@/lib/wallet/descriptor-wallet-manager'
import { invalidateLightningDashboardQueries } from '@/lib/lightning/lightning-dashboard-sync'
import { refreshWalletStoreFromLoadedBdk } from '@/lib/wallet/onchain-bdk-store-sync'
import { invalidateOnchainDashboardQueries } from '@/lib/wallet/onchain-dashboard-sync'
import {
  orchestrateOnchainLoad,
} from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import { orchestrateArkadeLoad } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import type { OnchainSyncThenSaveParams } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-types'

const CUSTOM_ESPLORA_URL_KEY_PREFIX = 'custom_esplora_url_'

async function orchestrateOnchainSyncThenSaveFromWalletUtils(
  params: OnchainSyncThenSaveParams,
): Promise<void> {
  const { orchestrateOnchainSyncThenSave } = await import(
    '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
  )
  await orchestrateOnchainSyncThenSave(params)
}

/**
 * Update the changeset of the currently active descriptor wallet.
 * Keys by `loadedDescriptorWallet` when set (matches WASM); otherwise persisted triple.
 */
export async function updateWalletChangeset(params: {
  walletId: number
  changesetJson: string
  markFullScanDone?: boolean
  lastSuccessfulEsploraSyncAt?: string
}): Promise<void> {
  const {
    walletId,
    changesetJson,
    markFullScanDone,
    lastSuccessfulEsploraSyncAt,
  } = params
  const { loadedDescriptorWallet, networkMode, addressType, accountId } =
    useWalletStore.getState()
  const descriptorContext = loadedDescriptorWallet ?? {
    networkMode,
    addressType,
    accountId,
  }
  const network = toBitcoinNetwork(descriptorContext.networkMode)
  await updateDescriptorWalletChangeset({
    walletId,
    network,
    addressType: descriptorContext.addressType,
    accountId: descriptorContext.accountId,
    changesetJson,
    markFullScanDone,
    lastSuccessfulEsploraSyncAt,
  })
}

export function getWalletInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export async function saveCustomEsploraUrl(
  network: NetworkMode,
  url: string,
): Promise<void> {
  validateEsploraUrl(url, network)
  await ensureMigrated()
  const walletDb = getDatabase()
  const settingsKey = `${CUSTOM_ESPLORA_URL_KEY_PREFIX}${network}`

  const existing = await walletDb
    .selectFrom('settings')
    .select('key')
    .where('key', '=', settingsKey)
    .executeTakeFirst()

  if (existing) {
    await walletDb
      .updateTable('settings')
      .set({ value: url })
      .where('key', '=', settingsKey)
      .execute()
  } else {
    await walletDb
      .insertInto('settings')
      .values({ key: settingsKey, value: url })
      .execute()
  }
}

export async function deleteCustomEsploraUrl(
  network: NetworkMode,
): Promise<void> {
  await ensureMigrated()
  const walletDb = getDatabase()
  await walletDb
    .deleteFrom('settings')
    .where('key', '=', `${CUSTOM_ESPLORA_URL_KEY_PREFIX}${network}`)
    .execute()
}

export async function loadCustomEsploraUrl(
  network: NetworkMode,
): Promise<string | null> {
  await ensureMigrated()
  const walletDb = getDatabase()
  const settingsRow = await walletDb
    .selectFrom('settings')
    .select('value')
    .where('key', '=', `${CUSTOM_ESPLORA_URL_KEY_PREFIX}${network}`)
    .executeTakeFirst()

  return settingsRow?.value ?? null
}

/** Stop-gap for full scan (consecutive unused addresses before stopping). Match import flow. */
const FULL_SCAN_STOP_GAP = 20

function invalidateDashboardQueriesAfterOnchainUpdate(): void {
  invalidateLightningDashboardQueries()
  invalidateOnchainDashboardQueries()
}

/**
 * Sync the active WASM wallet against Esplora and update wallet store with
 * balance and transactions.
 *
 * @param networkMode - Current network (e.g. testnet, mainnet)
 * @param options.useFullScan - If true, run a full scan instead of incremental sync.
 *   Use after loading a wallet so we discover all txs (e.g. faucet); use false or
 *   omit for the manual Sync button (incremental sync).
 */
export async function syncActiveWalletAndUpdateState(
  networkMode: NetworkMode,
  options?: { useFullScan?: boolean },
): Promise<void> {
  const customUrl = await loadCustomEsploraUrl(networkMode)
  const esploraUrl = getEsploraUrl(networkMode, customUrl)

  const { syncWallet, fullScanWallet, getBalance, getTransactionList } =
    useCryptoStore.getState()
  const { setBalance, setTransactions } = useWalletStore.getState()

  if (!esploraUrl) {
    const balance = await getBalance()
    const transactionList = await getTransactionList()
    setBalance(balance)
    setTransactions(transactionList)
    return
  }

  if (options?.useFullScan) {
    const toastId = toast.loading('Scanning blockchain…')
    try {
      await withEsploraFullScanRetries(() =>
        fullScanWallet(esploraUrl, FULL_SCAN_STOP_GAP),
      )
      toast.success('Wallet synced', { id: toastId })
    } catch (err) {
      toast.dismiss(toastId)
      throw err
    }
  } else {
    await syncWallet(esploraUrl)
    let balance = await getBalance()
    // Esplora can expose a confirmed UTXO before /tx (and scripthash) status includes
    // block_hash + block_time; BDK then records seen_at → untrusted pending. A single
    // immediate follow-up sync picks up anchor metadata once the indexer catches up.
    if (balance.confirmedSats === 0 && balance.untrustedPendingSats > 0) {
      await syncWallet(esploraUrl)
    }
  }

  const balance = await getBalance()
  const transactionList = await getTransactionList()
  setBalance(balance)
  setTransactions(transactionList)
}

export type DescriptorWalletEsploraSyncResult = 'completed' | 'syncFailed'

/**
 * After WASM is already loaded for a target descriptor wallet, run Esplora sync
 * (incremental or full scan) and persist full-scan completion when needed.
 * Does not set `walletStatus` — the caller owns UI state around this call.
 */
export async function syncLoadedDescriptorWalletWithEsplora(options: {
  networkMode: NetworkMode
  activeWalletId: number
  targetNetwork: BitcoinNetwork
  targetAddressType: AddressType
  targetAccountId: number
  fullScanNeeded: boolean
}): Promise<DescriptorWalletEsploraSyncResult> {
  try {
    await orchestrateOnchainSyncThenSaveFromWalletUtils({
      walletId: options.activeWalletId,
      networkMode: options.networkMode,
      addressType: options.targetAddressType,
      accountId: options.targetAccountId,
      syncKind: 'descriptorSwitch',
      useFullScan: options.fullScanNeeded,
      markFullScanDone: options.fullScanNeeded,
      descriptorWalletCoordinates: {
        network: options.targetNetwork,
        addressType: options.targetAddressType,
        accountId: options.targetAccountId,
      },
    })
    return 'completed'
  } catch (syncErr) {
    const detail = sanitizeErrorMessageForUi(errorMessage(syncErr))
    toast.error(
      detail
        ? `Sync failed after switching: ${detail}`
        : 'Sync failed after switching',
    )
    try {
      await refreshWalletStoreFromLoadedBdk()
      invalidateOnchainDashboardQueries()
    } catch {
      // Leave balance cleared if WASM is unavailable.
    }
    return 'syncFailed'
  }
}

export async function runIncrementalDashboardWalletSync(options: {
  networkMode: NetworkMode
  activeWalletId: number | null
}): Promise<void> {
  const { networkMode, activeWalletId } = options

  /**
   * Dashboard "Sync on-chain" is always incremental: it updates chain tip + revealed script
   * pubkeys so newly confirmed UTXOs become spendable. Full scan is for import, network/
   * address switch, and Full rescan — re-running it here (regtest included) can leave
   * Esplora-confirmed receives stuck as untrusted pending in BDK.
   */
  if (activeWalletId == null) {
    await syncActiveWalletAndUpdateState(networkMode, { useFullScan: false })
    invalidateDashboardQueriesAfterOnchainUpdate()
    toast.success('Wallet synced')
    return
  }

  const { addressType, accountId } = useWalletStore.getState()
  await orchestrateOnchainSyncThenSaveFromWalletUtils({
    walletId: activeWalletId,
    networkMode,
    addressType,
    accountId,
    syncKind: 'incrementalDashboard',
    useFullScan: false,
    markFullScanDone: false,
  })
  toast.success('Wallet synced')
}

/**
 * Reload the active descriptor wallet in WASM with an empty chain (same descriptors/network),
 * then refreshes {@link useWalletStore}'s receive address pointer.
 *
 * Used to recover when persisted `local_chain` does not match the Esplora indexer.
 */
export async function reloadActiveLoadedDescriptorWalletWithEmptyChain(params: {
  walletId: number
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
}): Promise<void> {
  const { walletId, networkMode, addressType, accountId } = params
  const network = toBitcoinNetwork(networkMode)
  const descriptorWallet = await resolveDescriptorWallet({
    walletId,
    targetNetwork: network,
    targetAddressType: addressType,
    targetAccountId: accountId,
  })
  const { loadWallet, getCurrentAddress } = useCryptoStore.getState()
  const { setCurrentAddress } = useWalletStore.getState()
  await loadWallet({
    externalDescriptor: descriptorWallet.externalDescriptor,
    internalDescriptor: descriptorWallet.internalDescriptor,
    network,
    changesetJson: descriptorWallet.changeSet,
    useEmptyChain: true,
  })
  const address = await getCurrentAddress()
  setCurrentAddress(address)
}

/**
 * Full Esplora scan for the dashboard "Full rescan" control: re-scans the
 * address gap (same BDK path as import). Use when incremental sync cannot fix
 * a wrong balance or history.
 *
 * If the first scan fails with bad local chain state, reloads with an empty chain
 * once and retries the full scan (then persists).
 *
 * Does not add its own success toast: {@link syncActiveWalletAndUpdateState} shows
 * loading and success toasts for the full-scan path.
 */
export async function runFullScanDashboardWalletSync(options: {
  networkMode: NetworkMode
  activeWalletId: number | null
}): Promise<void> {
  const { networkMode, activeWalletId } = options

  const scanAndPersist = async () => {
    if (activeWalletId == null) {
      await syncActiveWalletAndUpdateState(networkMode, { useFullScan: true })
      invalidateDashboardQueriesAfterOnchainUpdate()
      return
    }
    const { addressType, accountId } = useWalletStore.getState()
    await orchestrateOnchainSyncThenSaveFromWalletUtils({
      walletId: activeWalletId,
      networkMode,
      addressType,
      accountId,
      syncKind: 'fullRescanDashboard',
      useFullScan: true,
      markFullScanDone: true,
    })
  }

  try {
    await scanAndPersist()
  } catch (err) {
    const badLocalChainStateError = asBadLocalChainStateError(err)
    if (badLocalChainStateError == null) {
      throw err
    }

    if (activeWalletId == null) {
      throw badLocalChainStateError
    }

    const { loadedDescriptorWallet, addressType, accountId } =
      useWalletStore.getState()
    const descriptorWalletCoordinates = loadedDescriptorWallet ?? {
      networkMode,
      addressType,
      accountId,
    }

    await reloadActiveLoadedDescriptorWalletWithEmptyChain({
      walletId: activeWalletId,
      networkMode: descriptorWalletCoordinates.networkMode,
      addressType: descriptorWalletCoordinates.addressType,
      accountId: descriptorWalletCoordinates.accountId,
    })

    await scanAndPersist()
  }
}

/**
 * Retry handler for setup initial sync (toast action, dashboard banner): re-runs
 * orchestrated full scan + save for the active wallet.
 */
export async function runImportInitialEsploraSync(): Promise<void> {
  const { networkMode, activeWalletId, addressType, accountId } =
    useWalletStore.getState()
  const { setImportInitialSyncErrorMessage } = useWalletStore.getState()

  if (activeWalletId == null) {
    setImportInitialSyncErrorMessage(null)
    return
  }

  const customUrl = await loadCustomEsploraUrl(networkMode)
  const esploraUrl = getEsploraUrl(networkMode, customUrl)

  if (!esploraUrl) {
    const { getBalance, getTransactionList } = useCryptoStore.getState()
    const { setBalance, setTransactions } = useWalletStore.getState()
    const balance = await getBalance()
    const transactionList = await getTransactionList()
    setBalance(balance)
    setTransactions(transactionList)
    setImportInitialSyncErrorMessage(null)
    return
  }

  await orchestrateOnchainSyncThenSaveFromWalletUtils({
    walletId: activeWalletId,
    networkMode,
    addressType,
    accountId,
    syncKind: 'setupInitial',
    useFullScan: true,
    markFullScanDone: true,
    awaitCompletion: true,
    throwOnError: true,
  })
  setImportInitialSyncErrorMessage(null)
}

/**
 * Retry handler for import initial sync (toast action, dashboard banner): runs
 * {@link runImportInitialEsploraSync}, shows toasts, repopulates error state on failure.
 */
export async function retryImportInitialEsploraSyncWithWalletStatus(): Promise<void> {
  const { setImportInitialSyncErrorMessage } = useWalletStore.getState()
  try {
    setImportInitialSyncErrorMessage(null)
    await runImportInitialEsploraSync()
    toast.success('Initial sync complete')
  } catch (err) {
    setImportInitialSyncErrorMessage(
      userFacingLifecycleErrorMessage(err, 'Initial sync failed'),
    )
    showImportInitialSyncFailureToast(err, () => {
      void retryImportInitialEsploraSyncWithWalletStatus()
    })
  }
}

/**
 * Loads from persisted changeset when possible. If BDK reports a persisted chain
 * that does not match the target network (e.g. testnet4 state stored under another
 * descriptor wallet slot), retries with a fresh chain for that network so the UI can recover.
 */
export type LoadWalletPersistedChainMismatchResult = {
  /** True when the persisted changeset could not be applied and a fresh chain was loaded instead. */
  usedEmptyChainFallback: boolean
}

export async function loadWalletHandlingPersistedChainMismatch(
  loadWallet: (params: LoadWalletParams) => Promise<boolean>,
  params: LoadWalletParams,
): Promise<LoadWalletPersistedChainMismatchResult> {
  const { usedEmptyChainFallback } = await withPersistedChainMismatchRetry(
    loadWallet,
    params,
  )
  return { usedEmptyChainFallback }
}

/**
 * Resolve descriptor wallet, load into WASM, set current address, start
 * auto-lock timer. Does NOT sync. Used for lab mode where there is no Esplora.
 */
export async function loadDescriptorWalletWithoutSync(params: {
  walletId: number
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
}): Promise<void> {
  const { walletId, networkMode, addressType, accountId } = params
  await orchestrateOnchainLoad({
    walletId,
    networkMode,
    addressType,
    accountId,
    clearLastSyncTime: false,
  })
  if (isArkadeActiveForNetworkMode(networkMode)) {
    void orchestrateArkadeLoad({ walletId, networkMode }).catch((err) => {
      void import('@/lib/arkade/arkade-session-open-error-toast').then(
        ({ reportArkadeSessionOpenError }) => reportArkadeSessionOpenError(err),
      )
    })
  }
}

/**
 * Resolve descriptor wallet, load into WASM, set current address, start
 * auto-lock timer, then run Esplora sync (by default in the background after unlock).
 */
export async function loadDescriptorWalletAndSync(params: {
  walletId: number
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
  onSyncError?: (err: unknown) => void
  /**
   * When true, this function resolves only after Esplora sync and changeset persistence finish.
   * When false (default), unlock completes as soon as WASM is ready; sync cannot block or
   * fail the returned promise (errors go to `onSyncError` only).
   */
  awaitSync?: boolean
}): Promise<void> {
  const {
    walletId,
    networkMode,
    addressType,
    accountId,
    onSyncError,
    awaitSync = false,
  } = params

  await orchestrateOnchainLoad({
    walletId,
    networkMode,
    addressType,
    accountId,
    clearLastSyncTime: true,
  })

  if (isArkadeActiveForNetworkMode(networkMode)) {
    void orchestrateArkadeLoad({ walletId, networkMode }).catch((err) => {
      void import('@/lib/arkade/arkade-session-open-error-toast').then(
        ({ reportArkadeSessionOpenError }) => reportArkadeSessionOpenError(err),
      )
    })
  }

  const { orchestrateOnchainPostUnlockSync } = await import(
    '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
  )
  await orchestrateOnchainPostUnlockSync({
    walletId,
    networkMode,
    addressType,
    accountId,
    onSyncError,
    awaitCompletion: awaitSync,
  })
}
