import * as React from 'react'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/shared/utils'
import { designFocusClassName, designPillClassName } from '@/components/design/design-classes'

export type DesignButtonAppearance = 'primary' | 'secondary' | 'tertiary'

const appearanceClassName: Record<DesignButtonAppearance, string> = {
  primary:
    'bg-[var(--design-accent-primary)] text-[var(--design-text-button)] hover:bg-[var(--design-accent-primary-hover)] active:bg-[var(--design-accent-primary-active)] disabled:bg-[var(--design-accent-primary-disabled)] disabled:text-[var(--design-text-button-primary-disabled)]',
  secondary:
    'border-[var(--design-accent-secondary-stroke)] bg-transparent text-[var(--design-accent-secondary)] hover:border-[var(--design-accent-secondary-stroke-hover)] hover:text-[var(--design-accent-secondary-hover)] active:border-[var(--design-accent-secondary-stroke-active)] active:text-[var(--design-accent-secondary-active)] disabled:border-[var(--design-accent-secondary-stroke-disabled)] disabled:text-[var(--design-accent-secondary-disabled)]',
  tertiary:
    'bg-transparent text-[var(--design-text-regular)] hover:text-[var(--design-text-button-hover)] active:text-[var(--design-text-button-active)] disabled:text-[var(--design-text-button-tertiary-disabled)]',
}

const selectedSecondaryClassName =
  'border-2 border-[var(--design-accent-secondary)] bg-[color-mix(in_srgb,var(--design-accent-secondary)_20%,transparent)]'

export function DesignButton({
  appearance = 'primary',
  selected = false,
  icon,
  asChild = false,
  className,
  children,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> & {
  appearance?: DesignButtonAppearance
  selected?: boolean
  icon?: React.ReactNode
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : 'button'
  const showSelected = appearance === 'secondary' && selected

  return (
    <Comp
      data-slot="design-button"
      data-type={appearance}
      data-selected={showSelected ? 'true' : undefined}
      className={cn(
        designPillClassName,
        designFocusClassName,
        appearanceClassName[appearance],
        appearance === 'secondary' && !showSelected && 'border',
        showSelected && selectedSecondaryClassName,
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
