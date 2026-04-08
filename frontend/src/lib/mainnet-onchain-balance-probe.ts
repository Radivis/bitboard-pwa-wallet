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
 *
 * If loading mainnet wallets throws, still attempts to reload the committed sub-wallet and
 * refresh store balance/transactions so the WASM slot is not left on an arbitrary network.
 */
export async function sumMainnetOnChainSatsForWallet(params: {
  password: string
  walletId: number
}): Promise<number> {
  const { password, walletId } = params
  const walletDb = getDatabase()
  const payload = await loadWalletSecretsPayload(walletDb, password, walletId)
  const mainnetDescriptors = payload.descriptorWallets
    .filter((descriptorWallet) => descriptorWallet.network === 'bitcoin')
  if (mainnetDescriptors.length === 0) {
    return 0
  }

  const { loadedSubWallet, networkMode, addressType, accountId } = useWalletStore.getState()
  const committedSubWallet = loadedSubWallet ?? { networkMode, addressType, accountId }

  const { loadWallet, getBalance, exportChangeset, getTransactionList } =
    useCryptoStore.getState()

  const restoreActiveSubWalletView = async (): Promise<void> => {
    await loadDescriptorWalletWithoutSync({
      password,
      walletId,
      networkMode: committedSubWallet.networkMode,
      addressType: committedSubWallet.addressType,
      accountId: committedSubWallet.accountId,
    })
    const restoredBalance = await getBalance()
    const restoredTxs = await getTransactionList()
    useWalletStore.getState().setBalance(restoredBalance)
    useWalletStore.getState().setTransactions(restoredTxs)
  }

  let balanceSum = 0
  try {
    try {
      const currentChangeset = await exportChangeset()
      await updateDescriptorWalletChangeset({
        password,
        walletId,
        network: toBitcoinNetwork(committedSubWallet.networkMode),
        addressType: committedSubWallet.addressType,
        accountId: committedSubWallet.accountId,
        changesetJson: currentChangeset,
      })
    } catch (err) {
      if (!isBenignNoWalletLoadedForPersistError(err)) {
        throw err
      }
    }

    for (const descriptorWalletData of mainnetDescriptors) {
      await loadWalletHandlingPersistedChainMismatch(loadWallet, {
        externalDescriptor: descriptorWalletData.externalDescriptor,
        internalDescriptor: descriptorWalletData.internalDescriptor,
        network: 'bitcoin',
        changesetJson: descriptorWalletData.changeSet,
        useEmptyChain: false,
      })
      const balance = await getBalance()
      balanceSum += balance.total
    }
  } catch (probeErr) {
    try {
      await restoreActiveSubWalletView()
    } catch (restoreErr) {
      if (import.meta.env.DEV) {
        console.error(
          '[mainnet-onchain-balance-probe] Failed to restore wallet view after probe error',
          restoreErr,
        )
      }
    }
    throw probeErr
  }

  await restoreActiveSubWalletView()
  return balanceSum
}
