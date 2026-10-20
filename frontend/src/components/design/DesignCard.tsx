import * as React from 'react'

import { cn } from '@/lib/shared/utils'

export function DesignCard({
  className,
  elevation = 1,
  ...props
}: React.ComponentProps<'div'> & {
  elevation?: 1 | 2
}) {
  return (
    <div
      data-slot="design-card"
      data-elevation={elevation}
      className={cn(
        'design-ui flex flex-col gap-3 rounded-[16px] bg-[var(--design-surface-card)] px-4 py-3 text-[var(--design-text-card-title)] shadow-[var(--design-card-shadow)]',
        className,
      )}
      {...props}
    />
  )
}

export function DesignCardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="design-card-header" className={cn('flex flex-col gap-1', className)} {...props} />
}

export function DesignCardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="design-card-title"
      className={cn('text-base font-semibold', className)}
      {...props}
    />
  )
}

export function DesignCardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="design-card-description"
      className={cn('text-base font-normal text-[var(--design-text-card-description)]', className)}
      {...props}
    />
  )
}

export function DesignCardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="design-card-content" className={cn('flex flex-col gap-3', className)} {...props} />
}

export function DesignCardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="design-card-footer"
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    />
  )
}
