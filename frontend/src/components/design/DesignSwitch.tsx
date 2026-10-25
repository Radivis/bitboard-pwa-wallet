import type { ReactNode } from 'react'

import { designFocusClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

export type DesignSwitchOption<Value extends string> = {
  value: Value
  label: string
  icon?: ReactNode
}

type DesignSwitchProps<Value extends string> = {
  value: Value
  onValueChange: (value: Value) => void
  options: readonly DesignSwitchOption<Value>[]
  'aria-label': string
  disabled?: boolean
  className?: string
}

export function DesignSwitch<Value extends string>({
  value,
  onValueChange,
  options,
  'aria-label': ariaLabel,
  disabled = false,
  className,
}: DesignSwitchProps<Value>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="design-switch"
      className={cn(
        'design-ui inline-flex w-fit gap-1 rounded-[24px] border border-[var(--design-nav-stroke)] bg-[var(--design-nav-background)] p-1',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        const showsIcon = option.icon != null
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={showsIcon ? option.label : undefined}
            disabled={disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              designFocusClassName,
              'inline-flex items-center justify-center border px-3 py-2 whitespace-nowrap disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-6 [&_svg]:shrink-0',
              designTypeClassName.button,
              showsIcon
                ? 'text-[var(--design-input-content)]'
                : 'text-[var(--design-text-regular)]',
              selected
                ? 'rounded-[20px] border-[var(--design-nav-stroke)] bg-[var(--design-nav-background-selected)]'
                : 'rounded-[10px] border-transparent bg-transparent',
            )}
          >
            {showsIcon ? option.icon : option.label}
          </button>
        )
      })}
    </div>
  )
}
