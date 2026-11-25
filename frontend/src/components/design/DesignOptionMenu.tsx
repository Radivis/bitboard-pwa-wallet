import { useRef, useState, type Ref } from 'react'
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
  const selectedOptionRef = useRef<HTMLButtonElement>(null)

  return (
    <Popover.Portal>
      <Popover.Content
        data-slot={menuSlot}
        align="center"
        sideOffset={8}
        className={optionMenuPanelClassName}
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
            OPTION_MENU_RING_GUTTER_CLASS,
            OPTION_MENU_LIST_MAX_HEIGHT_CLASS,
          )}
        >
          {options.map((option) => (
            <OptionMenuItem
              key={option.value}
              label={option.label}
              selected={option.value === value}
              optionRef={option.value === value ? selectedOptionRef : undefined}
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
  optionRef,
  onSelect,
}: {
  label: string
  selected: boolean
  optionRef?: Ref<HTMLButtonElement>
  onSelect: () => void
}) {
  return (
    <button
      ref={optionRef}
      type="button"
      role="option"
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
