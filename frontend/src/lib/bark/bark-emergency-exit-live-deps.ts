import {
  barkEmergencyExitProgressDeps,
  runBarkEmergencyExitProgress,
} from '@/lib/bark/bark-emergency-exit-progress-deps'
import type { ClaimBarkEmergencyExitDeps } from '@/lib/bark/perform-bark-emergency-exit'
import type { StartBarkEmergencyExitDeps } from '@/lib/bark/perform-bark-emergency-exit'
import { getEsploraUrl } from '@/lib/wallet/bitcoin-utils'
import { loadCustomEsploraUrl } from '@/lib/wallet/wallet-utils'
import { useWalletStore } from '@/stores/walletStore'
import type { BarkEmergencyExitEstimate } from '@/workers/bark-api'
import { getBarkWorker } from '@/workers/bark-factory'
import { getCryptoWorker } from '@/workers/crypto-factory'

export { barkEmergencyExitProgressDeps, runBarkEmergencyExitProgress }

export type ReviewBarkEmergencyExitDeps = {
  estimate: (vtxoIds: string[], feeRateSatPerVb: number) => Promise<BarkEmergencyExitEstimate>
}

export function barkEmergencyExitReviewDeps(): ReviewBarkEmergencyExitDeps {
  return {
    estimate: (vtxoIds, feeRateSatPerVb) =>
      getBarkWorker().estimateEmergencyExit(vtxoIds, feeRateSatPerVb),
  }
}

export function barkEmergencyExitStartDeps(): StartBarkEmergencyExitDeps {
  return {
    start: (vtxoIds) => getBarkWorker().startEmergencyExit(vtxoIds),
  }
}

export function barkEmergencyExitClaimDeps(): ClaimBarkEmergencyExitDeps {
  return {
    pendingVtxoIds: async () => {
      const pending = await getBarkWorker().readPendingEmergencyClaim()
      return pending?.vtxoIds ?? []
    },
    drain: (address, feeRateSatPerVb, excludeVtxoIds) =>
      getBarkWorker().drainEmergencyExits(address, feeRateSatPerVb, excludeVtxoIds),
    broadcast: async (rawTxHex) => {
      const { networkMode } = useWalletStore.getState()
      const customUrl = await loadCustomEsploraUrl(networkMode)
      const esploraUrl = getEsploraUrl(networkMode, customUrl)
      return getCryptoWorker().broadcastTransaction(rawTxHex, esploraUrl)
    },
    rememberPendingClaim: (pending) => getBarkWorker().writePendingEmergencyClaim(pending),
    broadcastOnBarkChain: (rawTxHex) => getBarkWorker().broadcastEmergencyExitClaim(rawTxHex),
    syncExits: () => getBarkWorker().syncEmergencyExits(),
    clearPendingClaim: () => getBarkWorker().writePendingEmergencyClaim(null),
    startOnchainBackgroundSync: () => {
      const { activeWalletId, networkMode, addressType, accountId } = useWalletStore.getState()
      if (activeWalletId == null || networkMode === 'lab') return
      void import('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator').then(
        ({ orchestrateOnchainSyncThenSave }) =>
          orchestrateOnchainSyncThenSave({
            walletId: activeWalletId,
            networkMode,
            addressType,
            accountId,
            syncKind: 'postBroadcast',
            useFullScan: false,
            markFullScanDone: false,
            awaitCompletion: false,
            throwOnError: false,
          }),
      )
    },
  }
}
