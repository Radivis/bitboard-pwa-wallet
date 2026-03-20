import { toast } from 'sonner'

import { getDatabase, ensureMigrated } from '@/db/database'
import type { NetworkMode } from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import {
  getEsploraUrl,
  toBitcoinNetwork,
  validateEsploraUrl,
} from '@/lib/bitcoin-utils'
import { errorMessage } from '@/lib/utils'
import type { AddressType, BitcoinNetwork } from '@/workers/crypto-types'
import {
  updateDescriptorWalletChangeset,
  resolveDescriptorWallet,
} from '@/lib/descriptor-wallet-manager'

const CUSTOM_ESPLORA_URL_KEY_PREFIX = 'custom_esplora_url_'

/**
 * Update the changeset of the currently active descriptor wallet.
 * Reads (networkMode, addressType, accountId) from the wallet store.
 */
export async function updateWalletChangeset(
  password: string,
  walletId: number,
  changesetJson: string,
  options?: { markFullScanDone?: boolean },
): Promise<void> {
  const { networkMode, addressType, accountId } = useWalletStore.getState()
  const network = toBitcoinNetwork(networkMode)
  await updateDescriptorWalletChangeset(
    password,
    walletId,
    network,
    addressType,
    accountId,
    changesetJson,
    options,
  )
}

export function getWalletInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
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
  const key = `${CUSTOM_ESPLORA_URL_KEY_PREFIX}${network}`

  const existing = await walletDb
    .selectFrom('settings')
    .select('key')
    .where('key', '=', key)
    .executeTakeFirst()

  if (existing) {
    await walletDb
      .updateTable('settings')
      .set({ value: url })
      .where('key', '=', key)
      .execute()
  } else {
    await walletDb.insertInto('settings').values({ key, value: url }).execute()
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
  const result = await walletDb
    .selectFrom('settings')
    .select('value')
    .where('key', '=', `${CUSTOM_ESPLORA_URL_KEY_PREFIX}${network}`)
    .executeTakeFirst()

  return result?.value ?? null
}

/** Stop-gap for full scan (consecutive unused addresses before stopping). Match import flow. */
const FULL_SCAN_STOP_GAP = 20

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

  if (options?.useFullScan) {
    const toastId = toast.loading('Scanning blockchain…')
    try {
      await fullScanWallet(esploraUrl, FULL_SCAN_STOP_GAP)
      toast.success('Wallet synced', { id: toastId })
    } catch (err) {
      toast.dismiss(toastId)
      throw err
    }
  } else {
    await syncWallet(esploraUrl)
  }

  const balance = await getBalance()
  const txs = await getTransactionList()
  setBalance(balance)
  setTransactions(txs)
}

export type SubWalletEsploraSyncResult = 'completed' | 'sync_failed'

/**
 * After WASM is already loaded for a target sub-wallet, run Esplora sync
 * (incremental or full scan) and persist full-scan completion when needed.
 * Does not set `walletStatus` — the caller owns UI state around this call.
 */
export async function syncLoadedSubWalletWithEsplora(options: {
  networkMode: NetworkMode
  activeWalletId: number
  sessionPassword: string
  targetNetwork: BitcoinNetwork
  targetAddressType: AddressType
  targetAccountId: number
  fullScanNeeded: boolean
}): Promise<SubWalletEsploraSyncResult> {
  try {
    await syncActiveWalletAndUpdateState(options.networkMode, {
      useFullScan: options.fullScanNeeded,
    })
    if (options.fullScanNeeded) {
      const { exportChangeset } = useCryptoStore.getState()
      const changeset = await exportChangeset()
      await updateDescriptorWalletChangeset(
        options.sessionPassword,
        options.activeWalletId,
        options.targetNetwork,
        options.targetAddressType,
        options.targetAccountId,
        changeset,
        { markFullScanDone: true },
      )
    }
    return 'completed'
  } catch (syncErr) {
    const detail = errorMessage(syncErr)
    toast.error(`Sync failed after switching: ${detail}`)
    return 'sync_failed'
  }
}

/**
 * Incremental Esplora sync for the dashboard "Sync" button: updates balance and
 * transactions in the store, last sync time, and persisted changeset.
 */
export async function runIncrementalDashboardWalletSync(options: {
  networkMode: NetworkMode
  password: string | null
  activeWalletId: number | null
}): Promise<void> {
  await syncActiveWalletAndUpdateState(options.networkMode, {
    useFullScan: false,
  })
  const { setLastSyncTime } = useWalletStore.getState()
  setLastSyncTime(new Date())
  if (options.password && options.activeWalletId != null) {
    const { exportChangeset } = useCryptoStore.getState()
    const changeset = await exportChangeset()
    await updateWalletChangeset(
      options.password,
      options.activeWalletId,
      changeset,
    )
  }
}

/**
 * Resolve descriptor wallet, load into WASM, set current address, start
 * auto-lock timer. Does NOT sync. Used for lab mode where there is no Esplora.
 */
export async function loadDescriptorWalletWithoutSync(
  password: string,
  walletId: number,
  networkMode: NetworkMode,
  addressType: 'taproot' | 'segwit',
  accountId: number,
): Promise<void> {
  const network = toBitcoinNetwork(networkMode)
  const descriptorWallet = await resolveDescriptorWallet(
    password,
    walletId,
    network,
    addressType,
    accountId,
  )

  const { loadWallet, getCurrentAddress } = useCryptoStore.getState()
  const {
    setWalletStatus,
    setBalance,
    setTransactions,
    setCurrentAddress,
  } = useWalletStore.getState()

  setCurrentAddress(null)
  setBalance(null)
  setTransactions([])

  const useEmptyChain = network === 'testnet'
  await loadWallet(
    descriptorWallet.externalDescriptor,
    descriptorWallet.internalDescriptor,
    network,
    descriptorWallet.changeSet,
    useEmptyChain,
  )

  const address = await getCurrentAddress()
  setCurrentAddress(address)
  setWalletStatus('unlocked')

  const { startAutoLockTimer } = await import('@/stores/sessionStore')
  startAutoLockTimer(() => {
    useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState()
  })
}

/**
 * Resolve descriptor wallet, load into WASM, set current address, start
 * auto-lock timer, and sync. Used by WalletUnlock and AppInitializer.
 */
export async function loadDescriptorWalletAndSync(
  password: string,
  walletId: number,
  networkMode: NetworkMode,
  addressType: 'taproot' | 'segwit',
  accountId: number,
  options?: { onSyncError?: (err: unknown) => void },
): Promise<void> {
  const network = toBitcoinNetwork(networkMode)
  const descriptorWallet = await resolveDescriptorWallet(
    password,
    walletId,
    network,
    addressType,
    accountId,
  )

  const { loadWallet, getCurrentAddress, exportChangeset } =
    useCryptoStore.getState()
  const {
    setWalletStatus,
    setBalance,
    setTransactions,
    setCurrentAddress,
    setLastSyncTime,
  } = useWalletStore.getState()

  setCurrentAddress(null)
  setBalance(null)
  setTransactions([])
  setLastSyncTime(null)

  const useEmptyChain = network === 'testnet'
  await loadWallet(
    descriptorWallet.externalDescriptor,
    descriptorWallet.internalDescriptor,
    network,
    descriptorWallet.changeSet,
    useEmptyChain,
  )

  const address = await getCurrentAddress()
  setCurrentAddress(address)
  setWalletStatus('unlocked')

  const { startAutoLockTimer } = await import('@/stores/sessionStore')
  startAutoLockTimer(() => {
    useCryptoStore.getState().lockAndPurgeSensitiveRuntimeState()
  })

  try {
    await syncActiveWalletAndUpdateState(networkMode, { useFullScan: true })
    const changeset = await exportChangeset()
    await updateWalletChangeset(password, walletId, changeset, {
      markFullScanDone: true,
    })
  } catch (err) {
    options?.onSyncError?.(err)
  }
}
