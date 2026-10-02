import type { ClaimBarkEmergencyExitDeps } from '@/lib/bark/perform-bark-emergency-exit'
import type { ProgressBarkEmergencyExitDeps } from '@/lib/bark/perform-bark-emergency-exit'
import type { StartBarkEmergencyExitDeps } from '@/lib/bark/perform-bark-emergency-exit'
import { getEsploraUrl } from '@/lib/wallet/bitcoin-utils'
import { orchestrateBarkSync } from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'
import { useWalletStore } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'
import { getCryptoWorker } from '@/workers/crypto-factory'
import type { BarkEmergencyExitEstimate } from '@/workers/bark-api'

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

export function barkEmergencyExitProgressDeps(): ProgressBarkEmergencyExitDeps {
  return {
    progress: () => getBarkWorker().progressEmergencyExits(),
    signChild: (request, feeRateSatPerVb) =>
      getCryptoWorker().signP2aCpfpChild({
        parentTxHex: request.parentTxHex,
        effectiveFeeRateSatPerVb: feeRateSatPerVb,
        rbfMinFeeRateSatPerKwu: request.rbfMinFeeRateSatPerKwu,
        currentPackageFeeSats: request.currentPackageFeeSats,
      }),
    provideChild: (parentTxid, childTxHex) =>
      getBarkWorker().provideEmergencyExitCpfp(parentTxid, childTxHex),
    rememberUnconfirmedChild: (childTxHex) =>
      getCryptoWorker().applyUnconfirmedFundingTx(
        childTxHex,
        Math.floor(Date.now() / 1000),
      ),
  }
}

export function barkEmergencyExitClaimDeps(): ClaimBarkEmergencyExitDeps {
  return {
    drain: (address, feeRateSatPerVb) =>
      getBarkWorker().drainEmergencyExits(address, feeRateSatPerVb),
    broadcast: (rawTxHex) => {
      const { networkMode } = useWalletStore.getState()
      return getCryptoWorker().broadcastTransaction(rawTxHex, getEsploraUrl(networkMode))
    },
    syncBark: async () => {
      const { activeWalletId, networkMode } = useWalletStore.getState()
      if (activeWalletId == null) {
        throw new Error('Bark session is not open')
      }
      await orchestrateBarkSync({
        walletId: activeWalletId,
        networkMode,
        throwOnError: true,
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
