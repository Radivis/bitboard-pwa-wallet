import * as React from 'react'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/shared/utils'
import { designDestructiveShapeClassName, designFocusClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'

const destructiveClassName =
  'border border-[var(--design-special-destructive)] bg-[var(--design-special-destructive-background)] text-[var(--design-text-regular-bright)] hover:bg-[var(--design-special-destructive-background-hover)] active:bg-[var(--design-special-destructive-background-active)] disabled:opacity-50'

export function DesignDestructiveButton({
  icon,
  asChild = false,
  className,
  children,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> & {
  icon?: React.ReactNode
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="design-destructive-button"
      className={cn(
        designDestructiveShapeClassName,
        designTypeClassName.button,
        designFocusClassName,
        destructiveClassName,
        className,
      )}
      {...(asChild ? {} : { type })}
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
