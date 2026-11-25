import { useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { Popover } from 'radix-ui'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { designFocusClassName } from '@/components/design/design-classes'
import { designGlassBlurClassName } from '@/components/design/design-drawer-chrome'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

/**
 * Five option rows (48px), the 8px gaps between them, and 4px of padding on each
 * side so the 2px selection ring is inside the scrollport instead of clipped by it.
 */
const OPTION_MENU_LIST_MAX_HEIGHT_CLASS = 'max-h-[280px]'
/** Inset that keeps the selection ring off the scrollport edge. */
const OPTION_MENU_RING_GUTTER_CLASS = 'p-1'

const optionMenuTriggerClassName = cn(
  'design-ui inline-flex h-12 shrink-0 items-center justify-between gap-2 rounded-[20px] border border-[var(--design-nav-stroke)] px-3 text-[var(--design-text-regular)] [&_svg]:pointer-events-none [&_svg]:size-6 [&_svg]:shrink-0',
  designTypeClassName.button,
  designFocusClassName,
)

const optionMenuPanelClassName = cn(
  'z-50 min-w-[max(176px,var(--radix-popover-trigger-width))] rounded-[20px] border border-[var(--design-nav-stroke)] bg-[var(--design-elevation-drawer)] p-2 outline-none',
  designGlassBlurClassName,
)

const optionMenuItemClassName = cn(
  'flex h-12 w-full items-center rounded-[20px] border border-[var(--design-nav-stroke)] px-3 text-left text-[var(--design-text-regular)]',
  designTypeClassName.button,
  designFocusClassName,
)

export type DesignOptionMenuOption<Value extends string> = {
  value: Value
  label: string
}

function selectedOptionIndex<Value extends string>(
  options: readonly DesignOptionMenuOption<Value>[],
  value: Value,
): number {
  const index = options.findIndex((option) => option.value === value)
  return index === -1 ? 0 : index
}

/** Next roving-focus index. Arrow keys stop at the ends. Home and End jump. */
function nextOptionIndex(currentIndex: number, optionCount: number, key: string): number | null {
  if (optionCount === 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return optionCount - 1
  if (key === 'ArrowDown') return Math.min(currentIndex + 1, optionCount - 1)
  if (key === 'ArrowUp') return Math.max(currentIndex - 1, 0)
  return null
}

type DesignOptionMenuProps<Value extends string> = {
  id?: string
  value: Value
  onValueChange: (value: Value) => void
  options: readonly DesignOptionMenuOption<Value>[]
  /** Accessible name of the trigger and the option list. */
  ariaLabel: string
  className?: string
  triggerSlot?: string
  menuSlot?: string
}

export function DesignOptionMenu<Value extends string>({
  id,
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
  triggerSlot = 'design-option-menu-trigger',
  menuSlot = 'design-option-menu',
}: DesignOptionMenuProps<Value>) {
  const [menuOpen, setMenuOpen] = useState(false)
  const selectedOption = options.find((option) => option.value === value)
  const triggerLabel = selectedOption?.label ?? ''

  function selectOption(nextValue: Value) {
    setMenuOpen(false)
    onValueChange(nextValue)
  }

  return (
    <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Popover.Trigger
        id={id}
        type="button"
        data-slot={triggerSlot}
        className={cn(
          optionMenuTriggerClassName,
          className,
          menuOpen
            ? 'bg-[var(--design-nav-background-active)] ring-2 ring-[var(--design-accent-primary-active)]'
            : 'bg-[var(--design-nav-background)] hover:bg-[var(--design-nav-background-hover)]',
        )}
        aria-label={`${ariaLabel} ${triggerLabel}`}
        aria-haspopup="listbox"
      >
        <span>{triggerLabel}</span>
        {menuOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
      </Popover.Trigger>
      <OptionMenu
        menuSlot={menuSlot}
        ariaLabel={ariaLabel}
        value={value}
        options={options}
        onValueChange={selectOption}
      />
    </Popover.Root>
  )
}

function OptionMenu<Value extends string>({
  menuSlot,
  ariaLabel,
  value,
  options,
  onValueChange,
}: {
  menuSlot: string
  ariaLabel: string
  value: Value
  options: readonly DesignOptionMenuOption<Value>[]
  onValueChange: (value: Value) => void
}) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const initialIndex = selectedOptionIndex(options, value)
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const activeIndexRef = useRef(initialIndex)

  function focusOption(index: number) {
    if (options.length === 0) return
    const nextIndex = Math.min(Math.max(index, 0), options.length - 1)
    activeIndexRef.current = nextIndex
    setActiveIndex(nextIndex)
    optionRefs.current[nextIndex]?.focus()
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nextIndex = nextOptionIndex(activeIndexRef.current, options.length, event.key)
    if (nextIndex == null) return
    event.preventDefault()
    focusOption(nextIndex)
  }

  return (
    <Popover.Portal>
      <Popover.Content
        data-slot={menuSlot}
        align="center"
        sideOffset={8}
        className={optionMenuPanelClassName}
        onOpenAutoFocus={(openEvent) => {
          openEvent.preventDefault()
          focusOption(selectedOptionIndex(options, value))
        }}
      >
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            'flex flex-col gap-2 overflow-y-auto',
            OPTION_MENU_RING_GUTTER_CLASS,
            OPTION_MENU_LIST_MAX_HEIGHT_CLASS,
          )}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => (
            <OptionMenuItem
              key={option.value}
              label={option.label}
              selected={option.value === value}
              tabIndex={index === activeIndex ? 0 : -1}
              optionRef={(element) => {
                optionRefs.current[index] = element
              }}
              onSelect={() => onValueChange(option.value)}
            />
          ))}
        </div>
      </Popover.Content>
    </Popover.Portal>
  )
}

function OptionMenuItem({
  label,
  selected,
  tabIndex,
  optionRef,
  onSelect,
}: {
  label: string
  selected: boolean
  tabIndex: 0 | -1
  optionRef: Ref<HTMLButtonElement>
  onSelect: () => void
}) {
  return (
    <button
      ref={optionRef}
      type="button"
      role="option"
      tabIndex={tabIndex}
      aria-selected={selected}
      className={cn(
        optionMenuItemClassName,
        selected
          ? 'bg-[var(--design-nav-background-active)] ring-2 ring-[var(--design-accent-primary-active)]'
          : 'bg-[var(--design-nav-background)] hover:bg-[var(--design-nav-background-hover)]',
      )}
      onClick={onSelect}
    >
      {label}
    </button>
  )
}
