import { getEsploraUrl } from '@/lib/wallet/bitcoin-utils'
import { refreshWalletStoreFromLoadedBdk } from '@/lib/wallet/onchain-bdk-store-sync'
import { loadCustomEsploraUrl } from '@/lib/wallet/wallet-utils'
import { orchestrateOnchainLoad } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import { orchestrateOnchainSyncThenSave } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import type { AddressType, NetworkMode } from '@/stores/walletStore'

export type OnchainSetupAfterPersistParams = {
  walletId: number
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
  onSyncError?: (err: unknown) => void
}

/**
 * Post-create/import gate: reload from persisted secrets, then start one
 * setupInitial full scan. The scan does not block navigation; failures are
 * reported through onSyncError and the sync lifecycle.
 */
export async function orchestrateOnchainSetupAfterPersist(
  params: OnchainSetupAfterPersistParams,
): Promise<void> {
  const { walletId, networkMode, addressType, accountId, onSyncError } = params

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
    await refreshWalletStoreFromLoadedBdk(walletId)
    return
  }

  void orchestrateOnchainSyncThenSave({
    walletId,
    networkMode,
    addressType,
    accountId,
    syncKind: 'setupInitial',
    useFullScan: true,
    markFullScanDone: true,
    awaitCompletion: false,
    throwOnError: false,
    onSyncError,
  })
}
