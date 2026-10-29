import * as React from 'react'

import { designFocusClassName } from '@/components/design/design-classes'
import { designNavBarSurfaceClassName } from '@/components/design/design-drawer-chrome'
import { cn } from '@/lib/shared/utils'

const navToggleInteractionClassName =
  'hover:bg-[var(--design-nav-background-hover)] active:bg-[var(--design-nav-background-active)]'

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
        'design-ui inline-flex h-5 w-[46px] shrink-0 items-center justify-center rounded-[20px] px-3 py-2 text-[var(--design-text-regular)]',
        designNavBarSurfaceClassName,
        navToggleInteractionClassName,
        className,
      )}
    >
      <span
        className={cn(
          'relative block h-1 w-[22px] motion-safe:transition-transform motion-safe:duration-400 motion-safe:ease-out',
          !expanded && 'rotate-180',
        )}
      >
        <svg
          aria-hidden
          width="24.0005"
          height="5.95756"
          viewBox="0 0 24.0005 5.95756"
          fill="none"
          className="absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
        >
          <path
            d="M1.00027 1.00027L11.7724 4.91743C11.9196 4.97094 12.0809 4.97094 12.2281 4.91743L23.0003 1.00027"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  )
}
