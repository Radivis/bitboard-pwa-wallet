import type { ReactNode } from 'react'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react'

import { DesignNavButton } from '@/components/design/DesignNavButton'
import { DesignOptionMenu } from '@/components/design/DesignOptionMenu'
import { stepperButtonClassName, stepperClusterClassName } from '@/components/design/stepper-shared'
import { cn } from '@/lib/shared/utils'

export interface DesignPaginationProps {
  /** One-based page. Values outside 1..totalPages are clamped. */
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  /** Accessible name for the page trigger and the page list. */
  ariaLabel?: string
}

const pageStepButtonClassName = cn(stepperButtonClassName, 'disabled:opacity-50')

function resolveTotalPages(totalPages: number) {
  if (!Number.isFinite(totalPages)) return 1
  return Math.max(1, Math.trunc(totalPages))
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.trunc(page)), totalPages)
}

function pageLabel(page: number, totalPages: number) {
  return `${page}/${totalPages}`
}

export function DesignPagination({
  page,
  totalPages,
  onPageChange,
  ariaLabel = 'Page',
}: DesignPaginationProps) {
  const safeTotalPages = resolveTotalPages(totalPages)
  const safePage = clampPage(page, safeTotalPages)
  const pageOptions = Array.from({ length: safeTotalPages }, (_, index) => {
    const pageNumber = index + 1
    return { value: String(pageNumber), label: pageLabel(pageNumber, safeTotalPages) }
  })

  return (
    <div data-slot="design-pagination" className="flex items-center gap-2 px-3 py-2">
      <div className={stepperClusterClassName}>
        <PageStepButton
          label="First page"
          disabled={safePage <= 1}
          onClick={() => onPageChange(1)}
          icon={<ChevronFirst aria-hidden />}
        />
        <PageStepButton
          label="Previous page"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          icon={<ChevronLeft aria-hidden />}
        />
      </div>
      <DesignOptionMenu
        ariaLabel={ariaLabel}
        value={String(safePage)}
        options={pageOptions}
        triggerSlot="design-pagination-trigger"
        menuSlot="design-pagination-menu"
        onValueChange={(nextPage) => onPageChange(Number(nextPage))}
      />
      <div className={stepperClusterClassName}>
        <PageStepButton
          label="Next page"
          disabled={safePage >= safeTotalPages}
          onClick={() => onPageChange(safePage + 1)}
          icon={<ChevronRight aria-hidden />}
        />
        <PageStepButton
          label="Last page"
          disabled={safePage >= safeTotalPages}
          onClick={() => onPageChange(safeTotalPages)}
          icon={<ChevronLast aria-hidden />}
        />
      </div>
    </div>
  )
}

function PageStepButton({
  label,
  disabled,
  onClick,
  icon,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <DesignNavButton
      className={pageStepButtonClassName}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </DesignNavButton>
  )
}

