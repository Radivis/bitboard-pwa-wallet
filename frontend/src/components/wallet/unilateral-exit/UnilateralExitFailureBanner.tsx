import { X } from 'lucide-react'
import { DesignBanner } from '@/components/design/DesignBanner'
import { CopyableVtxoIdList } from '@/components/wallet/unilateral-exit/CopyableVtxoIdList'
import {
  clearPersistedUnilateralExitFailure,
  useUnilateralExitFailurePersistenceStore,
} from '@/lib/wallet/lifecycle/unilateral-exit-failure-persistence'
import type { ArkadeWalletScope } from '@/lib/arkade/arkade-session-scope'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

function formatUnixTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString()
}

function failureTitle(reasonCode: string): string {
  if (reasonCode === 'user_aborted') {
    return 'Unilateral exit aborted'
  }
  if (reasonCode === 'asp_swept_targets') {
    return 'Unilateral exit stopped — operator swept targets'
  }
  if (reasonCode === 'branch_funding_lost') {
    return 'Unilateral exit stopped — branch funding lost'
  }
  return 'Unilateral exit stopped'
}

function failureSummary(reasonCode: string): string | null {
  if (reasonCode === 'user_aborted') {
    return null
  }
  if (reasonCode === 'asp_swept_targets') {
    return 'The operator swept one or more target VTXOs before your unroll finished. Any recoverable balance may still be available via VTXO recovery.'
  }
  if (reasonCode === 'branch_funding_lost') {
    return 'On-chain evidence shows branch funding was seized (for example via an operator checkpoint) before unroll completed.'
  }
  return 'This unilateral exit job was terminated due to operator interference.'
}

export function UnilateralExitFailureBanner() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const activeWalletId = useWalletStore((state) => state.activeWalletId)
  const activeArkadeAccountId = useWalletStore((state) => state.activeArkadeAccountId)

  const failure = useUnilateralExitFailurePersistenceStore((state) => {
    if (
      activeWalletId == null ||
      activeArkadeAccountId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return null
    }
    return state.getFailure(activeWalletId, networkMode, activeArkadeAccountId)
  })

  if (failure == null) {
    return null
  }

  const walletScope: ArkadeWalletScope = {
    walletId: activeWalletId!,
    networkMode,
    arkadeAccountId: activeArkadeAccountId!,
  }

  const summary = failureSummary(failure.reasonCode)

  const userAborted = failure.reasonCode === 'user_aborted'

  return (
    <DesignBanner
      role="alert"
      status="error"
      data-testid="unilateral-exit-failure-banner"
      data-reason-code={failure.reasonCode}
      title={failureTitle(failure.reasonCode)}
      description={
        userAborted
          ? 'You have aborted your previous unilateral exit of the VTXOs with the ids:'
          : summary
      }
      optionalContent={
        <div className="space-y-2">
          {userAborted ? (
            <>
              <CopyableVtxoIdList vtxoIds={failure.vtxoIds} />
              <p>Please restart that exit soon, or consider those coins lost.</p>
            </>
          ) : null}
          {failure.detailMessage.length > 0 ? <p className="text-xs">{failure.detailMessage}</p> : null}
          {!userAborted ? (
            <p className="text-xs">
              Job started {formatUnixTimestamp(failure.jobStartedAtUnix)} · detected{' '}
              {formatUnixTimestamp(failure.detectedAtUnix)} · {failure.selectedLeafOutpoints.length}{' '}
              leaf{failure.selectedLeafOutpoints.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      }
      primaryAction={
        userAborted
          ? undefined
          : {
              label: 'Open VTXO viewer',
              to: '/wallet/arkade/vtxos',
            }
      }
      secondaryAction={{
        label: 'Dismiss',
        onClick: () => clearPersistedUnilateralExitFailure(walletScope),
        testId: 'unilateral-exit-failure-dismiss',
        icon: <X aria-hidden />,
      }}
    />
  )
}
