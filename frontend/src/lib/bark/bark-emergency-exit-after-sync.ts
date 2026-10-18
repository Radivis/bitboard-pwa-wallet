import { claimTransactionVisibility } from '@/lib/bark/bark-claim-transaction-visibility'
import { progressBarkEmergencyExitAutomatically } from '@/lib/bark/bark-emergency-exit-automation'
import { barkEmergencyExitScopeFor } from '@/lib/bark/bark-emergency-exit-funding-status'
import { runBarkEmergencyExitProgress } from '@/lib/bark/bark-emergency-exit-progress-deps'
import { pendingClaimDecision } from '@/lib/bark/bark-emergency-claim'
import { presetRatesForNetwork } from '@/hooks/useEsploraFeePresets'
import { getEsploraUrl } from '@/lib/wallet/bitcoin-utils'
import { loadCustomEsploraUrl } from '@/lib/wallet/wallet-utils'
import { useBarkEmergencyExitFundingStore } from '@/stores/barkEmergencyExitFundingStore'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

async function reconcilePendingEmergencyClaim(networkMode: NetworkMode): Promise<void> {
  const worker = getBarkWorker()
  const pending = await worker.readPendingEmergencyClaim()
  if (pending == null) return
  const rows = await worker.listEmergencyExits()
  const customUrl = await loadCustomEsploraUrl(networkMode)
  const esploraUrl = getEsploraUrl(networkMode, customUrl)
  const visibility =
    esploraUrl.length === 0
      ? 'unknown'
      : await claimTransactionVisibility(esploraUrl, pending.txid)
  if (
    pendingClaimDecision({ vtxoIds: pending.vtxoIds, rows, visibility }) === 'clear'
  ) {
    await worker.writePendingEmergencyClaim(null)
  }
}

/**
 * After a successful Bark sync: drop a claim Bark has now seen, then broadcast
 * exits that are already started. An empty exit list skips progress.
 */
export async function settleBarkEmergencyExitAfterSync(networkMode: NetworkMode): Promise<void> {
  await reconcilePendingEmergencyClaim(networkMode)
  const rows = await getBarkWorker().listEmergencyExits()
  if (rows.length === 0) {
    const fundingStore = useBarkEmergencyExitFundingStore.getState()
    fundingStore.clearFundingStatus()
    fundingStore.clearUnfundedParents()
    return
  }
  const { activeWalletId } = useWalletStore.getState()
  const scope = barkEmergencyExitScopeFor(activeWalletId, networkMode)
  const proceedAutomatically = await getBarkWorker().readProceedAutomatically()
  if (proceedAutomatically) {
    await progressBarkEmergencyExitAutomatically({ scope, networkMode })
    return
  }
  const feeRates = await presetRatesForNetwork(networkMode)
  await runBarkEmergencyExitProgress(scope, feeRates.High)
}
