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
        <div className="flex items-center gap-2">
          <DirectionIcon className={cn('size-6 shrink-0', directionColor[direction])} aria-hidden />
          <div className="flex min-w-0 flex-col items-start gap-2.5">
            <div className={cn('flex items-center gap-1 whitespace-nowrap', designTypeClassName.addresses, directionColor[direction])}>
              {amount}
            </div>
            {tags}
            <div className="flex items-center gap-2.5">
              {time}
              <SettlementIcon
                className={cn('size-6 shrink-0', settlementColor[settlement])}
                aria-label={settlementLabel ?? settlementName[settlement]}
              />
            </div>
          </div>
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
