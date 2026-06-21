import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SyncLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export type DashboardRailId = 'onchain' | 'lightning' | 'arkade'

function formatLastSyncedCaption(lastSyncedAt: Date | string): string {
  const date =
    lastSyncedAt instanceof Date ? lastSyncedAt : new Date(lastSyncedAt)
  return `Last synced: ${date.toLocaleString()}`
}

export type RailSyncControlProps = {
  rail: DashboardRailId
  syncLabel: string
  syncPhase: SyncLifecyclePhase
  lastSyncedAt: Date | string | null
  onSync: () => void
  isSyncPending?: boolean
  /** When false, sync control and caption are hidden (rail not configured). */
  railConfigured?: boolean
  secondaryAction?: ReactNode
}

export function RailSyncControl({
  rail,
  syncLabel,
  syncPhase,
  lastSyncedAt,
  onSync,
  isSyncPending = false,
  railConfigured = true,
  secondaryAction,
}: RailSyncControlProps) {
  if (!railConfigured) {
    return null
  }

  const isSyncing = syncPhase === 'syncing' || isSyncPending
  const lastSyncedIso =
    lastSyncedAt != null
      ? lastSyncedAt instanceof Date
        ? lastSyncedAt.toISOString()
        : new Date(lastSyncedAt).toISOString()
      : undefined

  return (
    <div className="mt-3 flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid={`rail-sync-${rail}`}
          onClick={onSync}
          disabled={isSyncing}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`}
            aria-hidden
          />
          {isSyncing ? 'Syncing…' : syncLabel}
        </Button>
        {secondaryAction}
      </div>
      <p
        className="text-xs text-muted-foreground"
        data-testid={`rail-sync-${rail}-caption`}
        {...(lastSyncedIso != null
          ? { 'data-rail-last-synced-at': lastSyncedIso }
          : {})}
      >
        {lastSyncedAt != null
          ? formatLastSyncedCaption(lastSyncedAt)
          : 'Not synced yet'}
      </p>
    </div>
  )
}
