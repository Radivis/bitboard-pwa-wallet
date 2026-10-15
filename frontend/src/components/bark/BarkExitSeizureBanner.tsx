import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BARK_EXIT_SEIZURE_WARNING } from '@/lib/bark/bark-exit-seizure'
import { useBarkExitSeizureNoticeStore } from '@/lib/bark/bark-exit-seizure-notice'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

const NO_SEIZED_VTXOS: readonly string[] = []

/** Stays until the user dismisses it. Lock and later syncs do not remove the notice. */
export function BarkExitSeizureBanner() {
  const walletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const notice = useBarkExitSeizureNoticeStore((state) => state.notice)
  const seizedVtxoIds =
    walletId != null && notice?.walletId === walletId && notice.networkMode === networkMode
      ? notice.vtxoIds
      : NO_SEIZED_VTXOS

  if (
    walletId == null ||
    !walletIsUnlockedOrSyncing(walletStatus) ||
    !isBarkEnabled ||
    !isBarkNetworkMode(networkMode) ||
    seizedVtxoIds.length === 0
  ) {
    return null
  }

  return (
    <div
      role="alert"
      data-testid="bark-exit-seizure-banner"
      className="border-b border-red-900/80 bg-red-600 px-4 py-3 text-red-50 shadow-md dark:bg-red-950 dark:text-red-50"
    >
      <div className="mx-auto flex max-w-screen-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-100" aria-hidden />
          <p className="text-sm leading-relaxed">{BARK_EXIT_SEIZURE_WARNING}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0 bg-white text-red-900 hover:bg-red-50 dark:bg-red-100 dark:hover:bg-white"
          data-testid="bark-exit-seizure-dismiss"
          onClick={() => {
            void useBarkExitSeizureNoticeStore
              .getState()
              .dismissNotice(walletId, networkMode)
              .catch(() => {
                // The Bark account still has the notice, so the banner stays.
              })
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  )
}
