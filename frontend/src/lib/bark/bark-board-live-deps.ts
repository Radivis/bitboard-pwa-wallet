import type { PerformBarkBoardDeps } from '@/lib/bark/perform-bark-board'
import type { ReviewBarkBoardDeps } from '@/lib/bark/review-bark-board'
import { orchestrateBarkSync } from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'
import { exportChangesetForPersistence } from '@/lib/wallet/lifecycle/onchain-descriptor-mutation-guard'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { updateWalletChangeset } from '@/lib/wallet/wallet-utils'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore, type NetworkMode } from '@/stores/walletStore'
import { getBarkWorker } from '@/workers/bark-factory'

export function barkBoardReviewDeps(networkMode: NetworkMode): ReviewBarkBoardDeps {
  return {
    estimateBoardOffchainFee: (amountSats) =>
      getBarkWorker().estimateBoardOffchainFee(amountSats),
    prepareBoardFunding: () => getBarkWorker().prepareBoardFunding(),
    prepareOnchainSend: ({ toAddress, amountSats, feeRateSatPerVb }) =>
      useCryptoStore.getState().prepareOnchainSendTransaction({
        toAddress,
        amountSats,
        feeRateSatPerVb,
        network: toBitcoinNetwork(networkMode),
      }),
  }
}

export function barkBoardPerformDeps(): PerformBarkBoardDeps {
  return {
    signFundingPsbt: (psbtBase64) => useCryptoStore.getState().signFundingPsbt(psbtBase64),
    submitBoardPsbt: (signedPsbtBase64) => getBarkWorker().boardPsbt(signedPsbtBase64),
    applyUnconfirmedFundingTx: (rawTxHex) =>
      useCryptoStore.getState().applyUnconfirmedFundingTx(
        rawTxHex,
        Math.floor(Date.now() / 1000),
      ),
    persistOnchainChangeset: async () => {
      const walletId = useWalletStore.getState().activeWalletId
      if (walletId == null) {
        throw new Error('No active wallet')
      }
      const changesetJson = await exportChangesetForPersistence()
      await updateWalletChangeset({ walletId, changesetJson })
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
    syncBark: async () => {
      const { activeWalletId, networkMode } = useWalletStore.getState()
      if (activeWalletId == null) return
      await orchestrateBarkSync({
        walletId: activeWalletId,
        networkMode,
        throwOnError: false,
      })
    },
  }
}
