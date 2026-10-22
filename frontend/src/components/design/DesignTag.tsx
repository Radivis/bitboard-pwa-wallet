import * as React from 'react'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/shared/utils'
import { designFocusClassName } from '@/components/design/design-classes'

const designTagClassName =
  'design-ui inline-flex h-6 shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[12px] border border-[var(--design-tag-stroke)] bg-[var(--design-nav-background)] px-2 text-xs font-bold leading-4 whitespace-nowrap text-[var(--design-text-regular)] hover:bg-[var(--design-nav-background-hover)] active:bg-[var(--design-nav-background-active)] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'

export function DesignTag({
  icon,
  asChild = false,
  className,
  children,
  ...props
}: React.ComponentProps<'span'> & {
  icon?: React.ReactNode
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="design-tag"
      className={cn(designTagClassName, designFocusClassName, className)}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Comp>
  )
}
