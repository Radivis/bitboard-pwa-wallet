import { barkEmergencyExitProgressDeps } from '@/lib/bark/bark-emergency-exit-progress-deps'
import type { ClaimBarkEmergencyExitDeps } from '@/lib/bark/perform-bark-emergency-exit'
import type { StartBarkEmergencyExitDeps } from '@/lib/bark/perform-bark-emergency-exit'
import { getEsploraUrl } from '@/lib/wallet/bitcoin-utils'
import { orchestrateBarkSync } from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'
import { useWalletStore } from '@/stores/walletStore'
import type { BarkEmergencyExitEstimate } from '@/workers/bark-api'
import { getBarkWorker } from '@/workers/bark-factory'
import { getCryptoWorker } from '@/workers/crypto-factory'

export { barkEmergencyExitProgressDeps }

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
    broadcast: (rawTxHex) => {
      const { networkMode } = useWalletStore.getState()
      return getCryptoWorker().broadcastTransaction(rawTxHex, getEsploraUrl(networkMode))
    },
    rememberPendingClaim: (pending) => getBarkWorker().writePendingEmergencyClaim(pending),
    broadcastOnBarkChain: (rawTxHex) => getBarkWorker().broadcastEmergencyExitClaim(rawTxHex),
    syncExits: () => getBarkWorker().syncEmergencyExits(),
    clearPendingClaim: () => getBarkWorker().writePendingEmergencyClaim(null),
    syncBark: async () => {
      const { activeWalletId, networkMode } = useWalletStore.getState()
      if (activeWalletId == null) {
        throw new Error('Bark session is not open')
      }
      await orchestrateBarkSync({
        walletId: activeWalletId,
        networkMode,
        throwOnError: true,
        settleExits: false,
      })
    },
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
