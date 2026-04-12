import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react'

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
  /** Label for the page select (accessibility). */
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
  const safePage = Math.min(Math.max(0, pageIndex), totalPages - 1)
  const displayPageOneBased = safePage + 1

  return (
    <div className={cn('space-y-3', className)}>
      {children}
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="First page"
          disabled={safePage <= 0}
          onClick={() => onPageChange(0)}
        >
          <ChevronFirst className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Previous page"
          disabled={safePage <= 0}
          onClick={() => onPageChange(safePage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="sr-only">{ariaLabel}</span>
          <select
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={ariaLabel}
            value={displayPageOneBased}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10)
              if (!Number.isNaN(next)) onPageChange(next - 1)
            }}
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} / {totalPages}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Next page"
          disabled={safePage >= totalPages - 1}
          onClick={() => onPageChange(safePage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Last page"
          disabled={safePage >= totalPages - 1}
          onClick={() => onPageChange(totalPages - 1)}
        >
          <ChevronLast className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
