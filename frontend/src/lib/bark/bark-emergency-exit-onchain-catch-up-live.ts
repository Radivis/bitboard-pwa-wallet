import type { BarkEmergencyExitTip } from '@/lib/bark/bark-emergency-exit-automation'
import {
  catchUpOnchainWalletToChainTip,
  type OnchainCatchUpDeps,
} from '@/lib/bark/bark-emergency-exit-onchain-catch-up'
import { fetchEsploraChainTip, getEsploraUrl } from '@/lib/wallet/bitcoin-utils'
import { orchestrateOnchainSyncThenSave } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { loadCustomEsploraUrl } from '@/lib/wallet/wallet-utils'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { getCryptoWorker } from '@/workers/crypto-factory'

export async function fetchBarkExitChainTip(
  networkMode: NetworkMode,
): Promise<BarkEmergencyExitTip> {
  const customUrl = await loadCustomEsploraUrl(networkMode)
  const esploraUrl = getEsploraUrl(networkMode, customUrl)
  if (esploraUrl.length === 0) {
    throw new Error('Esplora URL is missing')
  }
  return fetchEsploraChainTip(esploraUrl)
}

/** Its own sync kind, so a periodic sync already in flight is awaited and a fresh one follows. */
async function syncActiveOnchainWallet(networkMode: NetworkMode): Promise<void> {
  const { activeWalletId, addressType, accountId } = useWalletStore.getState()
  if (activeWalletId == null) {
    throw new Error('No active wallet to sync')
  }
  await orchestrateOnchainSyncThenSave({
    walletId: activeWalletId,
    networkMode,
    addressType,
    accountId,
    syncKind: 'barkExitCatchUp',
    useFullScan: false,
    markFullScanDone: false,
    awaitCompletion: true,
    throwOnError: true,
  })
}

function onchainCatchUpDeps(networkMode: NetworkMode): OnchainCatchUpDeps {
  return {
    fetchTipHeight: async () => (await fetchBarkExitChainTip(networkMode)).height,
    syncOnchain: () => syncActiveOnchainWallet(networkMode),
    onchainTipHeight: () => getCryptoWorker().getLocalChainTipHeight(),
  }
}

/** Run before a progress so change confirmed in the newest block can fund the next children. */
export async function catchUpOnchainWalletForBarkExit(
  networkMode: NetworkMode,
  observedTipHeight?: number,
): Promise<void> {
  await catchUpOnchainWalletToChainTip(onchainCatchUpDeps(networkMode), observedTipHeight)
}
