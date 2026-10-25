import * as React from 'react'

import { cn } from '@/lib/shared/utils'
import { designFocusClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'

function hasText(value: React.InputHTMLAttributes<HTMLInputElement>['value']) {
  return value != null && String(value).length > 0
}

export const DesignInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'> & {
    leadingIcon?: React.ReactNode
    trailingIcon?: React.ReactNode
  }
>(function DesignInput(
  { leadingIcon, trailingIcon, className, disabled, readOnly, value, defaultValue, ...props },
  ref,
) {
  const filled = value !== undefined ? hasText(value) : hasText(defaultValue)
  const showTrailingIcon = trailingIcon != null && !disabled && !readOnly

  return (
    <div
      data-slot="design-input"
      data-status={filled ? 'filled' : 'empty'}
      className={cn(
        'design-ui flex h-12 w-full items-center gap-1 rounded-[16px] px-4',
        disabled
          ? 'bg-[var(--design-input-disabled-background)]'
          : 'bg-[var(--design-input-enabled-background)]',
        className,
      )}
    >
      {leadingIcon}
      <input
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        data-slot="design-input-field"
        className={cn(
          'min-w-0 flex-1 bg-transparent text-[var(--design-input-content)] outline-none placeholder:text-[var(--design-input-placeholder)] disabled:cursor-not-allowed',
          designTypeClassName.addresses,
          designFocusClassName,
        )}
        {...props}
      />
      {showTrailingIcon ? trailingIcon : null}
    </div>
  )
})
