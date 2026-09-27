import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore } from '@/stores/walletStore'

/**
 * Read balance and tx list from the loaded BDK wallet in WASM into walletStore.
 * When `expectedWalletId` is set, skip the write if the active wallet changed
 * while the WASM read was in flight.
 */
export async function refreshWalletStoreFromLoadedBdk(
  expectedWalletId?: number,
): Promise<void> {
  const { getBalance, getTransactionList } = useCryptoStore.getState()
  const balance = await getBalance()
  const transactions = await getTransactionList()
  const walletState = useWalletStore.getState()
  if (
    expectedWalletId != null &&
    walletState.activeWalletId !== expectedWalletId
  ) {
    return
  }
  walletState.setBalance(balance)
  walletState.setTransactions(transactions)
}
