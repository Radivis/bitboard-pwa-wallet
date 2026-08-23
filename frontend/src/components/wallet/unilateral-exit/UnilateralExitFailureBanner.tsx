import { AlertTriangle, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
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
  const activeArkadeConnectionId = useWalletStore((state) => state.activeArkadeConnectionId)

  const failure = useUnilateralExitFailurePersistenceStore((state) => {
    if (
      activeWalletId == null ||
      activeArkadeConnectionId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return null
    }
    return state.getFailure(activeWalletId, networkMode, activeArkadeConnectionId)
  })

  if (failure == null) {
    return null
  }

  const walletScope: ArkadeWalletScope = {
    walletId: activeWalletId!,
    networkMode,
    connectionId: activeArkadeConnectionId!,
  }

  const summary = failureSummary(failure.reasonCode)

  return (
    <div
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
      role="alert"
      data-testid="unilateral-exit-failure-banner"
      data-reason-code={failure.reasonCode}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium">{failureTitle(failure.reasonCode)}</p>
          {failure.reasonCode === 'user_aborted' ? (
            <div className="space-y-2 text-muted-foreground">
              <p>
                You have aborted your previous unilateral exit of the VTXOs with the ids:
              </p>
              <CopyableVtxoIdList vtxoIds={failure.vtxoIds} />
              <p>Please restart that exit soon, or consider those coins lost.</p>
            </div>
          ) : null}
          {summary != null ? <p className="text-muted-foreground">{summary}</p> : null}
          {failure.detailMessage.length > 0 ? (
            <p className="text-xs text-muted-foreground">{failure.detailMessage}</p>
          ) : null}
          {failure.reasonCode !== 'user_aborted' ? (
            <p className="text-xs text-muted-foreground">
              Job started {formatUnixTimestamp(failure.jobStartedAtUnix)} · detected{' '}
              {formatUnixTimestamp(failure.detectedAtUnix)} · {failure.selectedLeafOutpoints.length}{' '}
              leaf{failure.selectedLeafOutpoints.length === 1 ? '' : 's'}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {failure.reasonCode !== 'user_aborted' ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/wallet/arkade/vtxos">Open VTXO viewer</Link>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearPersistedUnilateralExitFailure(walletScope)}
              data-testid="unilateral-exit-failure-dismiss"
            >
              <X className="mr-1 h-4 w-4" aria-hidden />
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
