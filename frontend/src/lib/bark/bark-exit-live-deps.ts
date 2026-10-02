import type { PerformBarkExitDeps } from '@/lib/bark/perform-bark-exit'
import type { ReviewBarkExitDeps } from '@/lib/bark/review-bark-exit'
import { orchestrateBarkSync } from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'
import { useWalletStore } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

export function barkExitReviewDeps(): ReviewBarkExitDeps {
  return {
    estimateSendOnchain: (address, amountSats) =>
      getBarkWorker().estimateSendOnchain(address, amountSats),
    estimateOffboardAll: (address) => getBarkWorker().estimateOffboardAll(address),
  }
}

export function barkExitPerformDeps(): PerformBarkExitDeps {
  return {
    sendOnchain: (address, amountSats) => getBarkWorker().sendOnchain(address, amountSats),
    offboardAll: (address) => getBarkWorker().offboardAll(address),
    syncBark: async () => {
      const { activeWalletId, networkMode } = useWalletStore.getState()
      if (activeWalletId == null) return
      await orchestrateBarkSync({
        walletId: activeWalletId,
        networkMode,
        throwOnError: false,
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
