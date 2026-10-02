import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { DashboardActivityRailBadge } from '@/components/DashboardActivityRailBadge'
import { barkMovementActivityLabel } from '@/lib/bark/bark-history'
import { cn } from '@/lib/shared/utils'
import type { BarkMovementRow } from '@/workers/bark-api'

const STATUS_LABEL: Record<BarkMovementRow['status'], string> = {
  pending: 'Pending',
  successful: 'Successful',
  failed: 'Failed',
  canceled: 'Canceled',
}

interface BarkMovementItemProps {
  movement: BarkMovementRow
}

export function BarkMovementItem({ movement }: BarkMovementItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false)
  const isDecrease = movement.effectiveBalanceSats < 0
  const Icon = isDecrease ? ArrowUpRight : ArrowDownLeft
  const timestamp =
    movement.createdAtUnixSeconds > 0
      ? new Date(movement.createdAtUnixSeconds * 1000)
      : null
  const amountSats = Math.abs(movement.effectiveBalanceSats)
  const sign = movement.effectiveBalanceSats < 0 ? '-' : movement.effectiveBalanceSats > 0 ? '+' : ''

  return (
    <div
      data-testid={`bark-movement-${movement.id}`}
      className="cursor-pointer rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            isDecrease ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30',
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4',
              isDecrease ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{STATUS_LABEL[movement.status]}</p>
            <DashboardActivityRailBadge
              label={barkMovementActivityLabel(movement.subsystemName, movement.subsystemKind)}
            />
          </div>
          {timestamp != null && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={(event) => {
                event.stopPropagation()
                setShowAbsoluteTime(!showAbsoluteTime)
              }}
            >
              {showAbsoluteTime
                ? format(timestamp, 'yyyy-MM-dd HH:mm')
                : formatDistanceToNow(timestamp, { addSuffix: true })}
            </button>
          )}
        </div>
        <div className="text-right">
          <p
            className={cn(
              'text-sm font-medium',
              isDecrease ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            )}
            data-testid={`bark-movement-amount-${movement.id}`}
          >
            <span className="inline-flex items-baseline gap-0.5">
              {sign !== '' ? <span className="tabular-nums">{sign}</span> : null}
              <BitcoinAmountDisplay amountSats={amountSats} size="sm" />
            </span>
          </p>
        </div>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <p>Kind: {movement.subsystemKind}</p>
          {movement.offchainFeeSats > 0 ? (
            <p>Off-chain fee: {movement.offchainFeeSats} sats</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
