import { DesignBanner } from '@/components/design/DesignBanner'
import {
  BARK_ANCHOR_SWEEP_WARNING,
  BARK_CHECKPOINT_SEIZURE_WARNING,
  BARK_EXIT_NODE_SWEEP_KINDS,
  BARK_INTERNAL_SEIZURE_WARNING,
  BARK_LEAF_SEIZURE_WARNING,
  vtxoIdsForExitNodeSweepKind,
  type BarkExitNodeSweepKind,
} from '@/lib/bark/bark-exit-seizure'
import { useBarkExitChainNoticeStore } from '@/lib/bark/bark-exit-seizure-notice'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'

const EMPTY_NOTICE_ITEMS: readonly [] = []

const SEIZURE_NOTICE_BY_KIND: Record<BarkExitNodeSweepKind, { warning: string; testId: string }> = {
  anchor: { warning: BARK_ANCHOR_SWEEP_WARNING, testId: 'bark-exit-anchor-sweep' },
  internal: { warning: BARK_INTERNAL_SEIZURE_WARNING, testId: 'bark-exit-internal-seizure' },
  leaf: { warning: BARK_LEAF_SEIZURE_WARNING, testId: 'bark-exit-leaf-seizure' },
  checkpoint: { warning: BARK_CHECKPOINT_SEIZURE_WARNING, testId: 'bark-exit-checkpoint-seizure' },
}

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
  const exitNodeSweepVtxoItems = shownNotice?.exitNodeSweepVtxoItems ?? EMPTY_NOTICE_ITEMS
  const noticeSections = BARK_EXIT_NODE_SWEEP_KINDS.map((kind) => ({
    kind,
    ...SEIZURE_NOTICE_BY_KIND[kind],
    vtxoIds: vtxoIdsForExitNodeSweepKind(exitNodeSweepVtxoItems, kind),
  })).filter((section) => section.vtxoIds.length > 0)

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
          key={section.kind}
          kind={section.kind}
          walletId={walletId}
          networkMode={networkMode}
          warning={section.warning}
          vtxoIds={section.vtxoIds}
          testId={section.testId}
        />
      ))}
    </div>
  )
}

function NoticeSection(props: {
  kind: BarkExitNodeSweepKind
  walletId: number
  networkMode: NetworkMode
  warning: string
  vtxoIds: readonly string[]
  testId: string
}) {
  return (
    <DesignBanner
      status="error"
      role="alert"
      data-testid={props.testId}
      title={props.warning}
      optionalContent={
        <ul className="list-disc pl-5" data-testid={`${props.testId}-ids`}>
          {props.vtxoIds.map((vtxoId) => (
            <li key={vtxoId}>{vtxoId}</li>
          ))}
        </ul>
      }
      secondaryAction={{
        label: 'Dismiss',
        testId: `${props.testId}-dismiss`,
        onClick: () => {
          void useBarkExitChainNoticeStore
            .getState()
            .dismissNotice(props.walletId, props.networkMode, props.kind)
            .catch(() => {
              // The Bark account still has this list, so the section stays.
            })
        },
      }}
    />
  )
}
