import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, BadgeCheck, Clock, Zap } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import type { LightningPaymentWithWallet } from '@/lib/lightning-dashboard-sync'
import { formatBTC, formatSats } from '@/lib/bitcoin-utils'
import { cn } from '@/lib/utils'

interface LightningPaymentItemProps {
  payment: LightningPaymentWithWallet
}

export function LightningPaymentItem({ payment }: LightningPaymentItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false)

  const isSent = payment.direction === 'outgoing'
  const Icon = isSent ? ArrowUpRight : ArrowDownLeft
  const timestamp = new Date(payment.timestamp * 1000)

  return (
    <div
      data-testid={`ln-payment-${payment.connectionId}-${payment.paymentHash}`}
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
              {isSent ? 'Sent' : 'Received'} (Lightning)
            </p>
            <span className="inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              <Zap className="h-3 w-3" />
              LN
            </span>
          </div>
          <p className="truncate text-xs font-medium text-muted-foreground">
            {payment.walletLabel}
          </p>
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
        </div>

        <div className="text-right">
          <p
            className={cn(
              'text-sm font-medium tabular-nums',
              isSent ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            )}
          >
            {isSent ? '-' : '+'}
            {formatBTC(payment.amountSats)} BTC
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatSats(payment.amountSats)} sats
          </p>
        </div>

        <div className="ml-1">
          {payment.pending ? (
            <Clock className="h-4 w-4 text-yellow-500" />
          ) : (
            <BadgeCheck className="h-4 w-4 text-green-500" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Lightning wallet</span>
            <span className="max-w-[180px] truncate text-right font-medium text-foreground">
              {payment.walletLabel}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Payment hash</span>
            <span className="max-w-[180px] truncate font-mono text-[10px]">
              {payment.paymentHash}
            </span>
          </div>
          {payment.memo ? (
            <div className="flex justify-between gap-2">
              <span>Memo</span>
              <span className="text-right">{payment.memo}</span>
            </div>
          ) : null}
          {payment.feesPaidSats > 0 && (
            <div className="flex justify-between">
              <span>Fee</span>
              <span>{formatSats(payment.feesPaidSats)} sats</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Status</span>
            <span>{payment.pending ? 'Pending' : 'Settled'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
