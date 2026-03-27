import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared typography for top-of-page titles (see `PageHeader`). */
export const PAGE_HEADER_TITLE_CLASS = 'text-2xl font-bold tracking-tight'

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null
}

interface PageHeaderProps {
  title: string
  icon?: LucideIcon
  children?: ReactNode
  className?: string
}

export function PageHeader({ title, icon: Icon, children, className }: PageHeaderProps) {
  const titleText = title ?? ''

  const heading = (
    <h2
      className={cn(
        PAGE_HEADER_TITLE_CLASS,
        isDefined(Icon) && 'flex items-center gap-2',
      )}
    >
      {isDefined(Icon) ? <Icon className="h-8 w-8 shrink-0" aria-hidden /> : null}
      {titleText}
    </h2>
  )

  if (!isDefined(children)) {
    return heading
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2',
        className,
      )}
    >
      {heading}
      {children}
    </div>
  )
}
