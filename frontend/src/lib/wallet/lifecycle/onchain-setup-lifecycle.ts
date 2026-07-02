import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { getEsploraUrl } from '@/lib/wallet/bitcoin-utils'
import { loadCustomEsploraUrl } from '@/lib/wallet/wallet-utils'
import { orchestrateOnchainLoad } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import { orchestrateOnchainSyncThenSave } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import type { AddressType, NetworkMode } from '@/stores/walletStore'

export type OnchainSetupAfterPersistParams = {
  walletId: number
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
}

/**
 * Post-create/import gate: reload from persisted secrets, then run a single
 * orchestrated full scan + save before setup navigates away.
 */
export async function orchestrateOnchainSetupAfterPersist(
  params: OnchainSetupAfterPersistParams,
): Promise<void> {
  const { walletId, networkMode, addressType, accountId } = params

  await orchestrateOnchainLoad({
    walletId,
    networkMode,
    addressType,
    accountId,
    clearLastSyncTime: true,
  })

  const customUrl = await loadCustomEsploraUrl(networkMode)
  const esploraUrl = getEsploraUrl(networkMode, customUrl)

  if (!esploraUrl || networkMode === 'lab') {
    const { getBalance, getTransactionList } = useCryptoStore.getState()
    const { setBalance, setTransactions } = useWalletStore.getState()
    const balance = await getBalance()
    const transactionList = await getTransactionList()
    setBalance(balance)
    setTransactions(transactionList)
    return
  }

  await orchestrateOnchainSyncThenSave({
    walletId,
    networkMode,
    addressType,
    accountId,
    syncKind: 'setupInitial',
    useFullScan: true,
    markFullScanDone: true,
    awaitCompletion: true,
    throwOnError: true,
  })
}
