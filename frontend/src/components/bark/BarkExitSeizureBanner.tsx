import { DesignBanner } from '@/components/design/DesignBanner'
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
      className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-3"
    >
      {noticeSections.map((section) => (
        <NoticeSection
          key={section.testId}
          walletId={walletId}
          networkMode={networkMode}
          section={section}
        />
      ))}
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
    <DesignBanner
      status="error"
      role="alert"
      data-testid={props.section.testId}
      title={<SeizureWarning section={props.section} />}
      optionalContent={
        <ul className="list-disc pl-5" data-testid={`${props.section.testId}-ids`}>
          {props.section.vtxoIds.map((vtxoId) => (
            <li key={vtxoId} className="break-all font-mono">
              {vtxoId}
            </li>
          ))}
        </ul>
      }
      secondaryAction={{
        label: 'Dismiss',
        testId: `${props.section.testId}-dismiss`,
        onClick: () => {
          void useBarkExitChainNoticeStore
            .getState()
            .dismissNotice(props.walletId, props.networkMode, props.section.kind, spentOutput)
            .catch(() => {
              // The Bark account still has this list, so the section stays.
            })
        },
      }}
    />
  )
}

function SeizureWarning(props: { section: BarkExitSeizureSection }) {
  const parts = barkExitSeizureWarningParts(props.section)
  return (
    <>
      {parts.beforeTxid}
      {parts.txid != null ? <span className="break-all font-mono">{parts.txid}</span> : null}
      {parts.afterTxid}
    </>
  )
}

function spentOutputOfSection(section: BarkExitSeizureSection): BarkExitSpentOutput | null {
  if (section.spentTxid == null || section.spentVout == null) return null
  return { spentTxid: section.spentTxid, spentVout: section.spentVout }
}
