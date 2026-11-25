import { useState, type ComponentProps, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, BanknoteX, CircleCheck, CircleX, Clock, Copy } from 'lucide-react'
import { toast } from 'sonner'

import { designFocusClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

export type DesignTransactionDirection = 'received' | 'sent'
export type DesignTransactionSettlement = 'pending' | 'confirmed' | 'failed' | 'canceled'

export type DesignTransactionDetail = {
  label: string
  value: ReactNode
  copyText?: string
  copyAriaLabel?: string
  copiedMessage?: string
  /** Wallet names and memos stay in Regular type. Identifiers use Addresses. */
  prose?: boolean
}

const directionIcon = {
  received: ArrowDownLeft,
  sent: ArrowUpRight,
} as const

const directionColor = {
  received: 'text-[var(--design-status-success-foreground)]',
  sent: 'text-[var(--design-status-error-foreground)]',
} as const

const settlementIcon = {
  pending: Clock,
  confirmed: CircleCheck,
  failed: BanknoteX,
  canceled: CircleX,
} as const

const settlementColor = {
  pending: 'text-[var(--design-status-warning-foreground)]',
  confirmed: 'text-[var(--design-status-success-foreground)]',
  failed: 'text-[var(--design-status-error-foreground)]',
  canceled: 'text-[var(--design-status-info-foreground)]',
} as const

const settlementName = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  failed: 'Failed',
  canceled: 'Canceled',
} as const

export function DesignTransactionCard({
  direction,
  settlement,
  settlementLabel,
  amount,
  time,
  tags,
  details = [],
  className,
  ...props
}: ComponentProps<'div'> & {
  direction: DesignTransactionDirection
  settlement: DesignTransactionSettlement
  /** Spoken name for the settlement icon when it differs from the settlement. */
  settlementLabel?: string
  amount: ReactNode
  time?: ReactNode
  tags?: ReactNode
  details?: DesignTransactionDetail[]
}) {
  const [expanded, setExpanded] = useState(false)
  const DirectionIcon = directionIcon[direction]
  const SettlementIcon = settlementIcon[settlement]

  return (
    <div
      data-slot="design-transaction-card"
      className={cn('design-ui w-full cursor-pointer rounded-[20px] px-6 py-3', className)}
      onClick={() => setExpanded((current) => !current)}
      {...props}
    >
      <div className={cn('flex flex-col', expanded && details.length > 0 && 'gap-4')}>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2.5">
          <DirectionIcon
            className={cn(
              'col-start-1 col-end-2 row-start-1 size-6 shrink-0 self-center',
              directionColor[direction],
              tags != null ? 'row-end-4 md:row-end-3' : 'row-end-3',
            )}
            aria-hidden
          />
          {tags != null ? (
            <div className="col-start-2 col-end-4 row-start-2 row-end-3 min-w-0 md:col-end-3 md:row-start-1 md:row-end-2">
              {tags}
            </div>
          ) : null}
          <div
            className={cn(
              'col-start-2 col-end-4 row-start-1 row-end-2 flex items-center justify-end gap-1 whitespace-nowrap',
              designTypeClassName.addresses,
              directionColor[direction],
              tags != null && 'md:col-start-3',
            )}
          >
            {amount}
          </div>
          <div
            className={cn(
              'col-start-2 col-end-3 min-w-0',
              tags != null ? 'row-start-3 row-end-4 md:row-start-2 md:row-end-3' : 'row-start-2 row-end-3',
            )}
          >
            {time}
          </div>
          <SettlementIcon
            className={cn(
              'col-start-3 col-end-4 size-6 shrink-0 justify-self-end',
              settlementColor[settlement],
              tags != null ? 'row-start-3 row-end-4 md:row-start-2 md:row-end-3' : 'row-start-2 row-end-3',
            )}
            aria-label={settlementLabel ?? settlementName[settlement]}
          />
        </div>
        {expanded && details.length > 0 ? <DesignTransactionDetails details={details} /> : null}
      </div>
    </div>
  )
}

function DesignTransactionDetails({ details }: { details: DesignTransactionDetail[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {details.map((detail) => (
        <div key={detail.label} className="flex items-center justify-between gap-1">
          <span className={cn(designTypeClassName.regular, 'shrink-0 text-[var(--design-text-subdued)]')}>
            {detail.label}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'min-w-0 text-right text-[var(--design-text-regular)]',
                detail.prose ? designTypeClassName.regular : designTypeClassName.addresses,
              )}
            >
              {detail.value}
            </span>
            {detail.copyText != null ? (
              <button
                type="button"
                aria-label={detail.copyAriaLabel ?? `Copy ${detail.label}`}
                className={cn(
                  'inline-flex size-6 shrink-0 items-center justify-center text-[var(--design-text-regular)]',
                  designFocusClassName,
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  return copyDetailText(detail.copyText as string, detail.copiedMessage ?? 'Copied to clipboard')
                }}
              >
                <Copy className="size-6" aria-hidden />
              </button>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  )
}

async function copyDetailText(text: string, copiedMessage: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return
  }
  toast.success(copiedMessage)
}
