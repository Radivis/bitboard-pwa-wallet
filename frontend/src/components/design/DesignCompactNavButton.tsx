import * as React from 'react'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/shared/utils'
import { designFocusClassName } from '@/components/design/design-classes'

export type DesignCompactNavButtonStatus = 'default' | 'selected'

const statusClassName: Record<DesignCompactNavButtonStatus, string> = {
  default:
    'bg-[var(--design-nav-background)] hover:bg-[var(--design-nav-background-hover)] active:bg-[var(--design-nav-background-active)]',
  selected: 'bg-[var(--design-nav-background-selected)]',
}

export function DesignCompactNavButton({
  status = 'default',
  asChild = false,
  className,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> & {
  status?: DesignCompactNavButtonStatus
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="design-compact-nav-button"
      data-status={status}
      aria-current={status === 'selected' ? 'page' : undefined}
      className={cn(
        designFocusClassName,
        'design-ui inline-flex min-w-0 flex-col items-center justify-center gap-2 rounded-[20px] border border-[var(--design-nav-stroke)] px-3 py-2 text-base font-semibold text-[var(--design-text-regular)] [&_svg]:size-6 [&_svg]:shrink-0',
        statusClassName[status],
        className,
      )}
      {...(asChild ? {} : { type })}
      {...props}
    />
  )
}
