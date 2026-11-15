import { useRef, useState, type ReactNode, type Ref } from 'react'
import { Popover } from 'radix-ui'
import {
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from 'lucide-react'

import { designFocusClassName } from '@/components/design/design-classes'
import { designGlassBlurClassName } from '@/components/design/design-drawer-chrome'
import { DesignNavButton } from '@/components/design/DesignNavButton'
import { designTypeClassName } from '@/components/design/design-type'
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

/**
 * Five option rows (48px), the 8px gaps between them, and 4px of padding on each
 * side so the 2px selection ring is inside the scrollport instead of clipped by it.
 */
const PAGE_MENU_LIST_MAX_HEIGHT_CLASS = 'max-h-[280px]'
/** Inset that keeps the selection ring off the scrollport edge. */
const PAGE_MENU_RING_GUTTER_CLASS = 'p-1'

const pageTriggerClassName = cn(
  'design-ui inline-flex h-12 shrink-0 items-center justify-between gap-2 rounded-[20px] border border-[var(--design-nav-stroke)] px-3 text-[var(--design-text-regular)] [&_svg]:pointer-events-none [&_svg]:size-6 [&_svg]:shrink-0',
  designTypeClassName.button,
  designFocusClassName,
)

const pageMenuPanelClassName = cn(
  'z-50 min-w-[max(176px,var(--radix-popover-trigger-width))] rounded-[20px] border border-[var(--design-nav-stroke)] bg-[var(--design-elevation-drawer)] p-2 outline-none',
  designGlassBlurClassName,
)

const pageOptionClassName = cn(
  'flex h-12 w-full items-center rounded-[20px] border border-[var(--design-nav-stroke)] px-3 text-left text-[var(--design-text-regular)]',
  designTypeClassName.button,
  designFocusClassName,
)

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
  const [menuOpen, setMenuOpen] = useState(false)
  const label = pageLabel(safePage, safeTotalPages)

  function selectPage(nextPage: number) {
    setMenuOpen(false)
    onPageChange(nextPage)
  }

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
      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger
          type="button"
          data-slot="design-pagination-trigger"
          className={cn(
            pageTriggerClassName,
            menuOpen
              ? 'bg-[var(--design-nav-background-active)] ring-2 ring-[var(--design-accent-primary-active)]'
              : 'bg-[var(--design-nav-background)] hover:bg-[var(--design-nav-background-hover)]',
          )}
          aria-label={`${ariaLabel} ${label}`}
          aria-haspopup="listbox"
        >
          <span>{label}</span>
          {menuOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        </Popover.Trigger>
        <PageMenu
          ariaLabel={ariaLabel}
          page={safePage}
          totalPages={safeTotalPages}
          onPageChange={selectPage}
        />
      </Popover.Root>
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

function PageMenu({
  ariaLabel,
  page,
  totalPages,
  onPageChange,
}: {
  ariaLabel: string
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  const selectedOptionRef = useRef<HTMLButtonElement>(null)
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)

  return (
    <Popover.Portal>
      <Popover.Content
        data-slot="design-pagination-menu"
        align="center"
        sideOffset={8}
        className={pageMenuPanelClassName}
        onOpenAutoFocus={(openEvent) => {
          openEvent.preventDefault()
          selectedOptionRef.current?.focus()
        }}
      >
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            'flex flex-col gap-2 overflow-y-auto',
            PAGE_MENU_RING_GUTTER_CLASS,
            PAGE_MENU_LIST_MAX_HEIGHT_CLASS,
          )}
        >
          {pageNumbers.map((pageNumber) => (
            <PageOption
              key={pageNumber}
              pageNumber={pageNumber}
              totalPages={totalPages}
              selected={pageNumber === page}
              optionRef={pageNumber === page ? selectedOptionRef : undefined}
              onSelect={onPageChange}
            />
          ))}
        </div>
      </Popover.Content>
    </Popover.Portal>
  )
}

function PageOption({
  pageNumber,
  totalPages,
  selected,
  optionRef,
  onSelect,
}: {
  pageNumber: number
  totalPages: number
  selected: boolean
  optionRef?: Ref<HTMLButtonElement>
  onSelect: (page: number) => void
}) {
  return (
    <button
      ref={optionRef}
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        pageOptionClassName,
        selected
          ? 'bg-[var(--design-nav-background-active)] ring-2 ring-[var(--design-accent-primary-active)]'
          : 'bg-[var(--design-nav-background)] hover:bg-[var(--design-nav-background-hover)]',
      )}
      onClick={() => onSelect(pageNumber)}
    >
      {pageLabel(pageNumber, totalPages)}
    </button>
  )
}
