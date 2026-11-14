import { Fragment, type ReactNode } from 'react'

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
  'data-testid'?: string
  /**
   * Size the group to its parent and let options wrap onto extra rows.
   * An option stays as wide as its label, so a narrow row wraps instead of clipping it.
   */
  wrap?: boolean
  /** Wraps one option button, for example with an explainer target. The button should stay full width. */
  frameOption?: (option: DesignSwitchOption<Value>, optionButton: ReactNode) => ReactNode
}

export function DesignSwitch<Value extends string>({
  value,
  onValueChange,
  options,
  'aria-label': ariaLabel,
  disabled = false,
  className,
  'data-testid': testId,
  wrap = false,
  frameOption,
}: DesignSwitchProps<Value>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="design-switch"
      data-testid={testId}
      className={cn(
        'design-ui gap-1 rounded-[24px] border border-[var(--design-nav-stroke)] bg-[var(--design-nav-background)] p-1',
        wrap ? 'flex w-full min-w-0 flex-wrap' : 'inline-flex w-fit',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        const showsIcon = option.icon != null
        const optionButton = (
          <button
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
              wrap && 'w-full',
            )}
          >
            {showsIcon ? option.icon : option.label}
          </button>
        )
        const framedOption = frameOption ? frameOption(option, optionButton) : optionButton
        if (!wrap) {
          return <Fragment key={option.value}>{framedOption}</Fragment>
        }
        return (
          <div key={option.value} className="flex min-w-max grow shrink-0">
            {framedOption}
          </div>
        )
      })}
    </div>
  )
}
