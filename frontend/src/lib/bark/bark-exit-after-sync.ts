import { claimTransactionVisibility } from '@/lib/bark/bark-claim-transaction-visibility'
import type { BarkEmergencyExitScope } from '@/lib/bark/bark-emergency-exit-funding-status'
import { runBarkEmergencyExitProgress } from '@/lib/bark/bark-emergency-exit-progress-deps'
import { pendingClaimDecision } from '@/lib/bark/bark-emergency-claim'
import { presetRatesForNetwork } from '@/hooks/useEsploraFeePresets'
import { getEsploraUrl } from '@/lib/wallet/bitcoin-utils'
import { useBarkEmergencyExitFundingStore } from '@/stores/barkEmergencyExitFundingStore'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

async function reconcilePendingEmergencyClaim(networkMode: NetworkMode): Promise<void> {
  const worker = getBarkWorker()
  const pending = await worker.readPendingEmergencyClaim()
  if (pending == null) return
  const rows = await worker.listEmergencyExits()
  const esploraUrl = getEsploraUrl(networkMode)
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
export async function settleBarkExitAfterSync(networkMode: NetworkMode): Promise<void> {
  await reconcilePendingEmergencyClaim(networkMode)
  const rows = await getBarkWorker().listEmergencyExits()
  if (rows.length === 0) {
    useBarkEmergencyExitFundingStore.getState().clearFundingStatus()
    return
  }
  const feeRates = await presetRatesForNetwork(networkMode)
  await runBarkEmergencyExitProgress(activeExitScope(networkMode), feeRates.High)
}

function activeExitScope(networkMode: NetworkMode): BarkEmergencyExitScope | null {
  const { activeWalletId } = useWalletStore.getState()
  return activeWalletId == null ? null : { walletId: activeWalletId, networkMode }
}
