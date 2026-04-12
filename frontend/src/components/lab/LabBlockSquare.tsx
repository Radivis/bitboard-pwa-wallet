import { Link } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  Bitcoin,
  Blocks,
  Calendar,
  Clock,
  FlaskConical,
  Pickaxe,
  Receipt,
  Wallet,
} from 'lucide-react'
import type { LabOwner } from '@/lib/lab-owner'
import { formatBTC, formatSats } from '@/lib/bitcoin-utils'
import { getOwnerDisplayName, getOwnerIcon } from '@/lib/lab-utils'
import { cn } from '@/lib/utils'

type EntityForOwnerName = {
  labEntityId: number
  entityName: string | null
}

export type LabBlockSquareProps = {
  height: number
  txCount: number
  totalFeesSats: number
  /** Block net moved: sum of non-change outputs per non-coinbase tx (coinbase excluded). */
  netMovedSats: number
  minedOnUnix: number
  minedBy: LabOwner | null
  blockWeightLimitWu: number | null
  nonCoinbaseWeightUsedWu: number | null
  wallets: Array<{ wallet_id: number; name: string }>
  entities: readonly EntityForOwnerName[]
  className?: string
}

function weightFillFraction(
  used: number | null | undefined,
  limit: number | null | undefined,
): number | null {
  if (used == null || limit == null || !Number.isFinite(used) || !Number.isFinite(limit)) {
    return null
  }
  if (limit <= 0) return null
  return Math.min(1, Math.max(0, used / limit))
}

export function LabBlockSquare({
  height,
  txCount,
  totalFeesSats,
  netMovedSats,
  minedOnUnix,
  minedBy,
  blockWeightLimitWu,
  nonCoinbaseWeightUsedWu,
  wallets,
  entities,
  className,
}: LabBlockSquareProps) {
  const fillFraction = weightFillFraction(nonCoinbaseWeightUsedWu, blockWeightLimitWu)

  const fillHeightPercent =
    fillFraction != null ? Math.round(fillFraction * 10_000) / 100 : null
  const emptyHeightPercent =
    fillHeightPercent != null ? Math.round((100 - fillHeightPercent) * 100) / 100 : null

  const minedDate = new Date(minedOnUnix * 1000)
  const dateLabel = Number.isFinite(minedOnUnix) && minedOnUnix > 0 ? minedDate.toLocaleDateString() : '—'
  const timeLabel = Number.isFinite(minedOnUnix) && minedOnUnix > 0 ? minedDate.toLocaleTimeString() : '—'
  const netBtcLabel = formatBTC(netMovedSats)
  const fillPercentRounded =
    fillFraction != null ? Math.round(fillFraction * 100) : null
  const ariaWeightHint =
    fillPercentRounded != null
      ? `, non-coinbase weight about ${fillPercentRounded}% of the limit at mining`
      : ''

  return (
    <Link
      to="/lab/block/$height"
      params={{ height: String(height) }}
      preload={false}
      className={cn('group block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg', className)}
      aria-label={`Block ${height}, ${txCount} transactions, net moved ${netBtcLabel} BTC, mined ${dateLabel} ${timeLabel}${ariaWeightHint}`}
    >
      <div
        className={cn(
          'relative aspect-square min-h-[7.5rem] overflow-hidden rounded-lg border border-border',
          fillFraction == null && 'bg-muted/40',
        )}
      >
        {fillFraction != null && fillHeightPercent != null && emptyHeightPercent != null ? (
          <>
            <div
              data-testid="lab-block-square-fill"
              className="absolute bottom-0 left-0 right-0 z-0 bg-primary/22"
              style={{ height: `${fillHeightPercent}%` }}
            />
            <div
              className="absolute left-0 right-0 top-0 z-0 bg-muted/38"
              style={{ height: `${emptyHeightPercent}%` }}
            />
          </>
        ) : null}

        <div className="relative z-10 flex h-full min-h-0 flex-col justify-between gap-1 p-2 text-[0.9375rem] leading-tight">
          <div className="grid min-w-0 grid-cols-2 gap-x-1 gap-y-1">
            <span className="flex min-w-0 items-center gap-1 tabular-nums">
              <Blocks
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="sr-only">Height</span>
              <span className="truncate font-mono">{height}</span>
            </span>
            <span className="flex min-w-0 items-center justify-end gap-1 tabular-nums">
              <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="sr-only">Transactions</span>
              <span>{txCount}</span>
            </span>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-x-1 gap-y-1">
            <span className="flex min-w-0 items-start gap-1">
              <Pickaxe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="sr-only">Mined by</span>
              <span className="flex min-w-0 flex-1 items-start gap-1">
                {minedBy ? (
                  <>
                    <span className="line-clamp-2 min-w-0 flex-1 leading-tight break-words">
                      {getOwnerDisplayName(minedBy, wallets, entities)}
                    </span>
                    <span
                      className="mt-0.5 shrink-0 text-muted-foreground"
                      title={minedBy.kind === 'wallet' ? 'Wallet' : 'Lab entity'}
                    >
                      {getOwnerIcon(minedBy) === 'wallet' ? (
                        <Wallet className="h-4 w-4" aria-hidden />
                      ) : (
                        <FlaskConical className="h-4 w-4" aria-hidden />
                      )}
                      <span className="sr-only">
                        {minedBy.kind === 'wallet' ? 'Wallet' : 'Lab entity'}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">unknown</span>
                )}
              </span>
            </span>
            <span className="flex min-w-0 items-center justify-end gap-1 text-right tabular-nums">
              <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="sr-only">Total fees</span>
              <span className="truncate">{formatSats(totalFeesSats)}</span>
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-1 border-t border-border/60 pt-1">
            <Bitcoin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">Net moved {netBtcLabel} BTC</span>
            <span className="truncate font-mono tabular-nums text-[1.05rem] leading-tight">{netBtcLabel}</span>
            <span className="sr-only">{formatSats(netMovedSats)} sats</span>
          </div>

          <div className="flex min-w-0 flex-col gap-0.5 border-t border-border/60 pt-1 text-sm text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1">
              <Calendar className="h-4 w-4 shrink-0" aria-hidden />
              <span className="sr-only">Mined on date</span>
              <span className="truncate">{dateLabel}</span>
            </span>
            <span className="flex min-w-0 items-center gap-1">
              <Clock className="h-4 w-4 shrink-0" aria-hidden />
              <span className="sr-only">Mined on time</span>
              <span className="truncate tabular-nums">{timeLabel}</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
