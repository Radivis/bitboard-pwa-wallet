import * as React from 'react'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/shared/utils'
import { designFocusClassName, designPillClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'

export type DesignNavButtonStatus = 'default' | 'selected'

const statusClassName: Record<DesignNavButtonStatus, string> = {
  default:
    'border border-[var(--design-nav-stroke)] bg-[var(--design-nav-background)] text-[var(--design-text-regular)] hover:bg-[var(--design-nav-background-hover)] active:bg-[var(--design-nav-background-active)]',
  selected:
    'border border-[var(--design-nav-stroke)] bg-[var(--design-nav-background-selected)] text-[var(--design-text-regular)]',
}

export function DesignNavButton({
  status = 'default',
  asChild = false,
  className,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> & {
  status?: DesignNavButtonStatus
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="design-nav-button"
      data-status={status}
      aria-current={status === 'selected' ? 'page' : undefined}
      className={cn(
        designPillClassName,
        designTypeClassName.largeButton,
        designFocusClassName,
        statusClassName[status],
        className,
      )}
      {...(asChild ? {} : { type })}
      {...props}
    />
  )
}
