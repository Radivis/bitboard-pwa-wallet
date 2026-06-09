import { useState } from 'react'
import { ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import type { TransactionDetails } from '@/workers/crypto-types'
import {
  formatTxDirection,
  getTxGrossWalletDebitSats,
  getTxListDisplayAmountSats,
  truncateAddress,
} from '@/lib/wallet/bitcoin-utils'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { DashboardActivityRailBadge } from '@/components/DashboardActivityRailBadge'
import {
  ARKADE_ACTIVITY_BOARDING_INFOMODE,
  ARKADE_ACTIVITY_PAYMENT_INFOMODE,
  ARKADE_INFOMODE_IDS,
} from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_BOARDING_ACTIVITY_LABEL,
  ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL,
} from '@/lib/lightning/lightning-dashboard-sync'
import { cn } from '@/lib/shared/utils'

interface TransactionItemProps {
  transaction: TransactionDetails
  activityLabel?: string
}

export function TransactionItem({ transaction, activityLabel }: TransactionItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false)

  const direction = formatTxDirection(transaction)
  const amount = getTxListDisplayAmountSats(transaction)
  const isSent = direction === 'sent'
  const grossDebitSats = isSent ? getTxGrossWalletDebitSats(transaction) : 0

  const Icon = isSent ? ArrowUpRight : ArrowDownLeft

  const isBoardingActivityLabel =
    activityLabel === ARKADE_BOARDING_ACTIVITY_LABEL ||
    activityLabel === ONCHAIN_ARKADE_BOARDING_ACTIVITY_LABEL
  const activityInfomode =
    activityLabel != null && activityLabel !== ''
      ? isBoardingActivityLabel
        ? {
            infoId: ARKADE_INFOMODE_IDS.activityBoarding,
            title: ARKADE_ACTIVITY_BOARDING_INFOMODE.title,
            text: ARKADE_ACTIVITY_BOARDING_INFOMODE.text,
          }
        : activityLabel === 'Arkade'
          ? {
              infoId: ARKADE_INFOMODE_IDS.activityPayment,
              title: ARKADE_ACTIVITY_PAYMENT_INFOMODE.title,
              text: ARKADE_ACTIVITY_PAYMENT_INFOMODE.text,
            }
          : null
      : null

  const timestamp = transaction.confirmationTime
    ? new Date(transaction.confirmationTime * 1000)
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
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium capitalize">{direction}</p>
            {activityLabel != null && activityLabel !== '' && activityInfomode != null ? (
              <InfomodeWrapper
                infoId={activityInfomode.infoId}
                infoTitle={activityInfomode.title}
                infoText={activityInfomode.text}
                as="span"
              >
                <DashboardActivityRailBadge label={activityLabel} />
              </InfomodeWrapper>
            ) : activityLabel != null && activityLabel !== '' ? (
              <DashboardActivityRailBadge label={activityLabel} />
            ) : null}
          </div>
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
              'text-sm font-medium',
              isSent ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
            )}
          >
            <span className="inline-flex items-baseline gap-0.5">
              <span className="tabular-nums">{isSent ? '-' : '+'}</span>
              <BitcoinAmountDisplay amountSats={amount} size="sm" />
            </span>
          </p>
        </div>

        <div className="ml-1">
          {transaction.isConfirmed ? (
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
          {transaction.feeSats != null && (
            <div className="flex justify-between gap-2">
              <span>Fee</span>
              <span className="text-right">
                <BitcoinAmountDisplay amountSats={transaction.feeSats} size="sm" />
              </span>
            </div>
          )}
          {isSent && (
            <div className="flex justify-between gap-2">
              <span>Total (incl. fee)</span>
              <span className="text-right">
                <BitcoinAmountDisplay amountSats={grossDebitSats} size="sm" />
              </span>
            </div>
          )}
          {transaction.confirmationBlockHeight != null && (
            <div className="flex justify-between">
              <span>Block height</span>
              <span>{transaction.confirmationBlockHeight.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Status</span>
            <span>{transaction.isConfirmed ? 'Confirmed' : 'Pending'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
