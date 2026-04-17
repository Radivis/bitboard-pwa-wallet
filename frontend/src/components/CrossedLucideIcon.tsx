import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

type CrossedLucideIconProps = {
  icon: LucideIcon
  /** Applied to both the wrapper and the base icon (e.g. `size-11`). */
  sizeClassName?: string
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

/** Renders a Lucide icon with a crossed-out overlay (e.g. skull + X for “unkill”). */
export function CrossedLucideIcon({
  icon: Icon,
  sizeClassName = 'size-6',
  className,
  'aria-hidden': ariaHidden = true,
}: CrossedLucideIconProps) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        sizeClassName,
      )}
      aria-hidden={ariaHidden}
    >
      <Icon className={cn(sizeClassName, className)} />
      <X
        className="pointer-events-none absolute left-1/2 top-1/2 size-[92%] -translate-x-1/2 -translate-y-1/2 stroke-[2.5] text-muted-foreground"
        aria-hidden
      />
    </span>
  )
}
