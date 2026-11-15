import { DesignPagination } from '@/components/design/DesignPagination'
import { cn } from '@/lib/shared/utils'

/** Default when `pageSize` is omitted. Lab views should pass sizes from `lab-paginated-queries`. */
const CARD_PAGINATION_DEFAULT_PAGE_SIZE = 20

export type CardPaginationProps = {
  /** Max items per page; navigator hidden when totalCount <= pageSize. */
  pageSize?: number
  totalCount: number
  /** Zero-based page index. */
  pageIndex: number
  onPageChange: (pageIndex: number) => void
  children: React.ReactNode
  className?: string
  /** Accessible name for the page trigger and the page list. */
  ariaLabel?: string
}

export function CardPagination({
  pageSize = CARD_PAGINATION_DEFAULT_PAGE_SIZE,
  totalCount,
  pageIndex,
  onPageChange,
  children,
  className,
  ariaLabel = 'Page',
}: CardPaginationProps) {
  if (totalCount <= pageSize) {
    return <div className={className}>{children}</div>
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1)

  return (
    <div className={cn('space-y-3', className)}>
      {children}
      <div className="flex flex-wrap items-center justify-center border-t border-border pt-3">
        <DesignPagination
          page={safePageIndex + 1}
          totalPages={totalPages}
          ariaLabel={ariaLabel}
          onPageChange={(page) => onPageChange(page - 1)}
        />
      </div>
    </div>
  )
}
