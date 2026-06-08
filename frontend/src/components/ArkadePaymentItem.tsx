import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import type { ArkadePaymentRow } from '@/workers/arkade-api'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { DashboardActivityRailBadge } from '@/components/DashboardActivityRailBadge'
import { cn } from '@/lib/shared/utils'

interface ArkadePaymentItemProps {
  payment: ArkadePaymentRow
  activityLabel?: string
}

export function ArkadePaymentItem({ payment, activityLabel }: ArkadePaymentItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false)

  const isSent = payment.direction === 'outgoing'
  const Icon = isSent ? ArrowUpRight : ArrowDownLeft
  const timestamp =
    payment.timestamp > 0 ? new Date(payment.timestamp * 1000) : null

  return (
    <div
      data-testid={`arkade-payment-${payment.txid}`}
      className="cursor-pointer rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            isSent ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30',
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4',
              isSent ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium capitalize">
              {isSent ? 'Sent' : 'Received'}
            </p>
            <DashboardActivityRailBadge label={activityLabel ?? 'Arkade'} />
          </div>
          {timestamp != null && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={(e) => {
                e.stopPropagation()
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
              isSent ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            )}
          >
            <span className="inline-flex items-baseline gap-0.5">
              <span className="tabular-nums">{isSent ? '-' : '+'}</span>
              <BitcoinAmountDisplay amountSats={payment.amountSats} size="sm" />
            </span>
          </p>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="break-all font-mono">Txid: {payment.txid}</p>
          {payment.memo != null && payment.memo !== '' && (
            <p>Memo: {payment.memo}</p>
          )}
        </div>
      )}
    </div>
  )
}
