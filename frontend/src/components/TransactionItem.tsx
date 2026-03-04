import { useState } from 'react'
import { ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import type { TransactionDetails } from '@/workers/crypto-types'
import {
  formatBTC,
  formatSats,
  formatTxDirection,
  getTxAmount,
  truncateAddress,
} from '@/lib/bitcoin-utils'
import { cn } from '@/lib/utils'

interface TransactionItemProps {
  transaction: TransactionDetails
}

export function TransactionItem({ transaction }: TransactionItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false)

  const direction = formatTxDirection(transaction)
  const amount = getTxAmount(transaction)
  const isSent = direction === 'sent'

  const Icon = isSent ? ArrowUpRight : ArrowDownLeft

  const timestamp = transaction.confirmation_time
    ? new Date(transaction.confirmation_time * 1000)
    : null

  return (
    <div
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
          <p className="text-sm font-medium capitalize">{direction}</p>
          {timestamp && (
            <button
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
              'text-sm font-medium tabular-nums',
              isSent ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            )}
          >
            {isSent ? '-' : '+'}
            {formatBTC(amount)} BTC
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatSats(amount)} sats
          </p>
        </div>

        <div className="ml-1">
          {transaction.is_confirmed ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <Clock className="h-4 w-4 text-yellow-500" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>TXID</span>
            <span className="font-mono">{truncateAddress(transaction.txid, 12, 12)}</span>
          </div>
          {transaction.fee_sats != null && (
            <div className="flex justify-between">
              <span>Fee</span>
              <span>{formatSats(transaction.fee_sats)} sats</span>
            </div>
          )}
          {transaction.confirmation_block_height != null && (
            <div className="flex justify-between">
              <span>Block height</span>
              <span>{transaction.confirmation_block_height.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Status</span>
            <span>{transaction.is_confirmed ? 'Confirmed' : 'Pending'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
