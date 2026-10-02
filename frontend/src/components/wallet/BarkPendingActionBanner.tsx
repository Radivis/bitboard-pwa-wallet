import { Loader2 } from 'lucide-react'
import { useBarkPendingActionsQuery } from '@/hooks/useBarkPendingActionsQuery'
import { formatSats, truncateAddress } from '@/lib/wallet/bitcoin-utils'
import type { BarkPendingAction } from '@/workers/bark-api'

export function BarkPendingActionBanner() {
  const pendingActionsQuery = useBarkPendingActionsQuery()
  const pendingActions = pendingActionsQuery.data ?? []
  if (pendingActions.length === 0) return null

  return (
    <div className="space-y-2">
      {pendingActions.map((action) => (
        <BarkPendingActionRow key={`${action.kind}:${action.id}`} action={action} />
      ))}
    </div>
  )
}

function BarkPendingActionRow({ action }: { action: BarkPendingAction }) {
  return (
    <div
      className="rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-sm"
      role="status"
      data-testid="bark-pending-action-banner"
    >
      <div className="flex items-start gap-2">
        <Loader2
          className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-sky-700 dark:text-sky-300"
          aria-hidden
        />
        <div className="space-y-1">
          <p className="font-medium">{action.title}</p>
          <p className="text-muted-foreground">{action.status}</p>
          <p data-testid="bark-pending-action-amount">{formatSats(action.amountSats)} sats</p>
          {action.destination != null ? (
            <p className="text-xs text-muted-foreground" title={action.destination}>
              Destination:{' '}
              <span className="font-mono">{truncateAddress(action.destination)}</span>
            </p>
          ) : null}
          {action.txid != null ? (
            <p className="text-xs text-muted-foreground" title={action.txid}>
              <span className="font-mono">{truncateAddress(action.txid)}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
