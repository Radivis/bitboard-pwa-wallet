import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { designFocusClassName } from '@/components/design/design-classes'
import { cn } from '@/lib/shared/utils'

const navToggleBackgroundClassName =
  'bg-[var(--design-nav-background)] hover:bg-[var(--design-nav-background-hover)] active:bg-[var(--design-nav-background-active)]'

export function DesignNavToggle({
  expanded,
  className,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> & {
  expanded: boolean
}) {
  return (
    <button
      type={type}
      data-slot="design-nav-toggle"
      data-direction={expanded ? 'down' : 'up'}
      {...props}
      aria-expanded={expanded}
      aria-label={expanded ? 'Hide navigation' : 'Show navigation'}
      className={cn(
        designFocusClassName,
        'design-ui inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] p-3 text-[var(--design-text-regular)]',
        navToggleBackgroundClassName,
        className,
      )}
    >
      <ChevronDown
        aria-hidden
        className={cn(
          'size-6 motion-safe:transition-transform motion-safe:duration-400 motion-safe:ease-out',
          !expanded && 'rotate-180',
        )}
      />
    </button>
  )
}
