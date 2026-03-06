import { getDatabase, ensureMigrated } from '@/db/database'
import type { NetworkMode } from '@/stores/walletStore'
import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import {
  getEsploraUrl,
  toBitcoinNetwork,
  validateEsploraUrl,
} from '@/lib/bitcoin-utils'
import {
  updateDescriptorWalletChangeset,
  resolveDescriptorWallet,
} from '@/lib/descriptor-wallet-manager'

/**
 * Update the changeset of the currently active descriptor wallet.
 * Reads (networkMode, addressType, accountId) from the wallet store.
 */
export async function updateWalletChangeset(
  password: string,
  walletId: number,
  changesetJson: string,
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
  const db = getDatabase()
  const key = `custom_esplora_url_${network}`

  const existing = await db
    .selectFrom('settings')
    .select('key')
    .where('key', '=', key)
    .executeTakeFirst()

  if (existing) {
    await db
      .updateTable('settings')
      .set({ value: url })
      .where('key', '=', key)
      .execute()
  } else {
    await db.insertInto('settings').values({ key, value: url }).execute()
  }
}

export async function deleteCustomEsploraUrl(
  network: NetworkMode,
): Promise<void> {
  await ensureMigrated()
  const db = getDatabase()
  await db
    .deleteFrom('settings')
    .where('key', '=', `custom_esplora_url_${network}`)
    .execute()
}

export async function loadCustomEsploraUrl(
  network: NetworkMode,
): Promise<string | null> {
  await ensureMigrated()
  const db = getDatabase()
  const result = await db
    .selectFrom('settings')
    .select('value')
    .where('key', '=', `custom_esplora_url_${network}`)
    .executeTakeFirst()

  return result?.value ?? null
}

/**
 * Sync the active WASM wallet against Esplora and update wallet store with
 * balance and transactions.
 */
export async function syncActiveWalletAndUpdateState(
  networkMode: NetworkMode,
): Promise<void> {
  const customUrl = await loadCustomEsploraUrl(networkMode)
  const esploraUrl = getEsploraUrl(networkMode, customUrl)

  const { syncWallet, getBalance, getTransactionList } =
    useCryptoStore.getState()
  const { setBalance, setTransactions } = useWalletStore.getState()

  await syncWallet(esploraUrl)
  const balance = await getBalance()
  const txs = await getTransactionList()
  setBalance(balance)
  setTransactions(txs)
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

  const { loadWallet, getCurrentAddress } = useCryptoStore.getState()
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

  await loadWallet(
    descriptorWallet.externalDescriptor,
    descriptorWallet.internalDescriptor,
    network,
    descriptorWallet.changeSet,
  )

  const address = await getCurrentAddress()
  setCurrentAddress(address)
  setWalletStatus('unlocked')

  const { startAutoLockTimer } = await import('@/stores/sessionStore')
  startAutoLockTimer(() => {
    useWalletStore.getState().lockWallet()
  })

  try {
    await syncActiveWalletAndUpdateState(networkMode)
  } catch (err) {
    options?.onSyncError?.(err)
  }
}
