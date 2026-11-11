import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  barkExitSeizureWarningParts,
  seizureBannerSections,
  type BarkExitSeizureSection,
  type BarkExitSpentOutput,
} from '@/lib/bark/bark-exit-seizure'
import { useBarkExitChainNoticeStore } from '@/lib/bark/bark-exit-seizure-notice'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'

const EMPTY_NOTICE_ITEMS: readonly [] = []

/** Stays until the user dismisses each section. Lock and later syncs do not remove a list. */
export function BarkExitSeizureBanner() {
  const walletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const notice = useBarkExitChainNoticeStore((state) => state.notice)
  const shownNotice =
    walletId != null && notice?.walletId === walletId && notice.networkMode === networkMode
      ? notice
      : null
  const noticeSections = seizureBannerSections(shownNotice?.exitNodeSweepVtxoItems ?? EMPTY_NOTICE_ITEMS)

  if (
    walletId == null ||
    !walletIsUnlockedOrSyncing(walletStatus) ||
    !isBarkEnabled ||
    !isBarkNetworkMode(networkMode) ||
    noticeSections.length === 0
  ) {
    return null
  }

  return (
    <div
      role="alert"
      data-testid="bark-exit-seizure-banner"
      className="border-b border-red-900/80 bg-red-600 px-4 py-3 text-red-50 shadow-md dark:bg-red-950 dark:text-red-50"
    >
      <div className="mx-auto flex max-w-screen-xl flex-col gap-4">
        {noticeSections.map((section) => (
          <NoticeSection
            key={section.testId}
            walletId={walletId}
            networkMode={networkMode}
            section={section}
          />
        ))}
      </div>
    </div>
  )
}

function NoticeSection(props: {
  walletId: number
  networkMode: NetworkMode
  section: BarkExitSeizureSection
}) {
  const spentOutput = spentOutputOfSection(props.section)
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-100" aria-hidden />
        <div className="min-w-0 space-y-2">
          <SeizureWarning section={props.section} />
          <ul
            className="list-disc pl-5 text-sm leading-relaxed"
            data-testid={`${props.section.testId}-ids`}
          >
            {props.section.vtxoIds.map((vtxoId) => (
              <li key={vtxoId} className="break-all font-mono">
                {vtxoId}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0 bg-white text-red-900 hover:bg-red-50 dark:bg-red-100 dark:hover:bg-white"
        data-testid={`${props.section.testId}-dismiss`}
        onClick={() => {
          void useBarkExitChainNoticeStore
            .getState()
            .dismissNotice(props.walletId, props.networkMode, props.section.kind, spentOutput)
            .catch(() => {
              // The Bark account still has this list, so the section stays.
            })
        }}
      >
        Dismiss
      </Button>
    </div>
  )
}

function SeizureWarning(props: { section: BarkExitSeizureSection }) {
  const parts = barkExitSeizureWarningParts(props.section)
  return (
    <p className="text-sm leading-relaxed">
      {parts.beforeTxid}
      {parts.txid != null ? <span className="break-all font-mono">{parts.txid}</span> : null}
      {parts.afterTxid}
    </p>
  )
}

function spentOutputOfSection(section: BarkExitSeizureSection): BarkExitSpentOutput | null {
  if (section.spentTxid == null || section.spentVout == null) return null
  return { spentTxid: section.spentTxid, spentVout: section.spentVout }
}
