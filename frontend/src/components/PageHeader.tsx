import type { LucideIcon } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

type PageHeaderIcon = LucideIcon | ComponentType<{ className?: string }>

/** Screen-heading metrics for a regular page title. Area indexes pass `variant="area"`. */
const PAGE_HEADER_TITLE_CLASS = designTypeClassName.screenHeading

export type PageHeaderVariant = 'screen' | 'area'

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null
}

interface PageHeaderProps {
  title: string
  icon?: PageHeaderIcon
  children?: ReactNode
  className?: string
  variant?: PageHeaderVariant
}

export function PageHeader({
  title,
  icon: Icon,
  children,
  className,
  variant = 'screen',
}: PageHeaderProps) {
  const titleText = title ?? ''
  const titleClassName =
    variant === 'area' ? designTypeClassName.areaHeading : PAGE_HEADER_TITLE_CLASS

  const heading = (
    <h2
      className={cn(
        titleClassName,
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
