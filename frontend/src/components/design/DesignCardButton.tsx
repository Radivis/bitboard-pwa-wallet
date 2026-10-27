import type { LucideIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { designFocusClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

type DesignCardButtonDestination =
  | '/'
  | '/wallet'
  | '/setup'
  | '/lab/blocks'
  | '/library'
  | '/guides'
  | '/guides/how-to-get-bitcoin'
  | '/guides/introduction'
  | '/settings'

interface DesignCardButtonProps {
  to: DesignCardButtonDestination
  icon: LucideIcon
  children: string
}

/** Full-width Card-Button: elevation fill, per-state inner and outer shadows, and a leading icon. */
export function DesignCardButton({ to, icon: Icon, children }: DesignCardButtonProps) {
  return (
    <Link
      to={to}
      data-slot="design-card-button"
      className={cn(
        'design-ui flex w-full items-center justify-center gap-1 rounded-[32px] px-6 py-3',
        designTypeClassName.largeButton,
        designFocusClassName,
      )}
    >
      <Icon className="size-6 shrink-0" aria-hidden />
      {children}
    </Link>
  )
}
