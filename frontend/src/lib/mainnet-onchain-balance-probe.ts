import { getDatabase } from '@/db/database'
import { loadWalletSecretsPayload } from '@/db/wallet-persistence'
import { updateDescriptorWalletChangeset } from '@/lib/descriptor-wallet-manager'
import { toBitcoinNetwork } from '@/lib/bitcoin-utils'
import { errorMessage } from '@/lib/utils'
import {
  loadDescriptorWalletWithoutSync,
  loadWalletHandlingPersistedChainMismatch,
} from '@/lib/wallet-utils'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore } from '@/stores/walletStore'

const NO_ACTIVE_WALLET_IN_WASM =
  'No active wallet. Call create_wallet or load_wallet first.'

function isBenignNoWalletLoadedForPersistError(err: unknown): boolean {
  return errorMessage(err).includes(NO_ACTIVE_WALLET_IN_WASM)
}

/**
 * Sums BDK-reported on-chain balance for every mainnet (`bitcoin`) descriptor sub-wallet.
 * Temporarily loads each into the single WASM slot, then restores the previously active sub-wallet.
 * Ignores Lightning / NWC entirely.
 *
 * **Side effect:** After restoring the active sub-wallet, updates `useWalletStore` with the
 * current balance and transaction list from WASM so the UI does not show stale data from the
 * probe loop. Treat this as “probe + refresh active wallet view,” not a pure read.
 */
export async function sumMainnetOnChainSatsForWallet(params: {
  password: string
  walletId: number
}): Promise<number> {
  const { password, walletId } = params
  const walletDb = getDatabase()
  const payload = await loadWalletSecretsPayload(walletDb, password, walletId)
  const mainnetDescriptors = payload.descriptorWallets.filter((dw) => dw.network === 'bitcoin')
  if (mainnetDescriptors.length === 0) {
    return 0
  }

  const { loadedSubWallet, networkMode, addressType, accountId } = useWalletStore.getState()
  const committed = loadedSubWallet ?? { networkMode, addressType, accountId }

  const { loadWallet, getBalance, exportChangeset, getTransactionList } =
    useCryptoStore.getState()

  try {
    const currentChangeset = await exportChangeset()
    await updateDescriptorWalletChangeset({
      password,
      walletId,
      network: toBitcoinNetwork(committed.networkMode),
      addressType: committed.addressType,
      accountId: committed.accountId,
      changesetJson: currentChangeset,
    })
  } catch (err) {
    if (!isBenignNoWalletLoadedForPersistError(err)) {
      throw err
    }
  }

  let sum = 0
  for (const dw of mainnetDescriptors) {
    await loadWalletHandlingPersistedChainMismatch(loadWallet, {
      externalDescriptor: dw.externalDescriptor,
      internalDescriptor: dw.internalDescriptor,
      network: 'bitcoin',
      changesetJson: dw.changeSet,
      useEmptyChain: false,
    })
    const balance = await getBalance()
    sum += balance.total
  }

  await loadDescriptorWalletWithoutSync({
    password,
    walletId,
    networkMode: committed.networkMode,
    addressType: committed.addressType,
    accountId: committed.accountId,
  })

  const restoredBalance = await getBalance()
  const txs = await getTransactionList()
  useWalletStore.getState().setBalance(restoredBalance)
  useWalletStore.getState().setTransactions(txs)

  return sum
}
