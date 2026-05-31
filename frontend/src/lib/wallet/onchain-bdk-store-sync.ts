import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore } from '@/stores/walletStore'

/** Read balance and tx list from the loaded BDK wallet in WASM into walletStore. */
export async function refreshWalletStoreFromLoadedBdk(): Promise<void> {
  const { getBalance, getTransactionList } = useCryptoStore.getState()
  const { setBalance, setTransactions } = useWalletStore.getState()
  setBalance(await getBalance())
  setTransactions(await getTransactionList())
}
