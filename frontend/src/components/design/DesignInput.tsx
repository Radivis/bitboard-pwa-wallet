import * as React from 'react'
import { BrushCleaning, SquarePen, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/shared/utils'
import { DesignButton } from '@/components/design/DesignButton'
import { designFocusClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'

type InputWithValueTracker = HTMLInputElement & {
  _valueTracker?: { setValue: (value: string) => void }
}

/** Chromium draws its own clear icon on type="search". The brush is the clear control. */
const nativeSearchCancelClassName =
  '[&::-webkit-search-cancel-button]:[-webkit-appearance:none] [&::-webkit-search-cancel-button]:hidden'

function inputText(value: React.ComponentProps<'input'>['value']) {
  if (value == null) return ''
  return String(value)
}

function writeFieldText(input: HTMLInputElement, nextValue: string) {
  const previousValue = input.value
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(input, nextValue)
  const tracker = (input as InputWithValueTracker)._valueTracker
  tracker?.setValue(previousValue)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export const DesignInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'> & {
    leadingIcon?: LucideIcon
    resetTo?: string
    onReset?: () => void
  }
>(function DesignInput(
  {
    leadingIcon: LeadingIcon,
    resetTo,
    onReset,
    className,
    disabled,
    readOnly,
    value,
    defaultValue,
    placeholder,
    onChange,
    ...props
  },
  ref,
) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uncontrolledText, setUncontrolledText] = React.useState(() => inputText(defaultValue))
  const isControlled = value !== undefined
  const text = isControlled ? inputText(value) : uncontrolledText
  const editable = !disabled && !readOnly
  const showPen = editable && text.length === 0 && placeholder != null && String(placeholder).length > 0
  const showClear = editable && text.length > 0
  const showReset = resetTo !== undefined || onReset !== undefined
  const resetDisabled = Boolean(disabled || readOnly || (resetTo !== undefined && text === resetTo))

  function setInputElement(node: HTMLInputElement | null) {
    inputRef.current = node
    if (typeof ref === 'function') {
      ref(node)
      return
    }
    if (ref) ref.current = node
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!isControlled) setUncontrolledText(event.target.value)
    onChange?.(event)
  }

  function clearField() {
    const input = inputRef.current
    if (!input) return
    writeFieldText(input, '')
  }

  function resetField() {
    const input = inputRef.current
    if (input && resetTo !== undefined) writeFieldText(input, resetTo)
    onReset?.()
  }

  return (
    <div className={cn('flex min-w-min max-w-full flex-col items-start gap-2', className)}>
      <div
        data-slot="design-input"
        data-status={text.length > 0 ? 'filled' : 'empty'}
        className={cn(
          'design-ui flex h-12 w-full min-w-min items-center gap-1 rounded-[16px] px-4',
          disabled
            ? 'bg-[var(--design-input-disabled-background)]'
            : 'bg-[var(--design-input-enabled-background)]',
        )}
      >
        {LeadingIcon ? (
          <LeadingIcon
            aria-hidden
            className={cn(
              'size-6 shrink-0',
              disabled
                ? 'text-[var(--design-input-placeholder)]'
                : 'text-[var(--design-input-content)]',
            )}
          />
        ) : null}
        <div className="relative min-w-12 flex-1">
          <input
            ref={setInputElement}
            value={value}
            defaultValue={defaultValue}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            data-slot="design-input-field"
            className={cn(
              'w-full min-w-0 bg-transparent text-[var(--design-input-content)] outline-none disabled:cursor-not-allowed',
              nativeSearchCancelClassName,
              showPen
                ? 'placeholder:text-transparent'
                : 'placeholder:text-[var(--design-input-placeholder)]',
              designTypeClassName.addresses,
              designFocusClassName,
            )}
            onChange={handleChange}
            {...props}
          />
          {showPen ? (
            <span
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-y-0 left-0 flex w-max max-w-full items-center gap-1 text-[var(--design-input-placeholder)]',
                designTypeClassName.addresses,
              )}
            >
              <span className="min-w-0 truncate">{placeholder}</span>
              <SquarePen className="size-6 shrink-0" />
            </span>
          ) : null}
        </div>
        {showClear ? (
          <button
            type="button"
            aria-label="Clear"
            className={cn(
              'inline-flex shrink-0 text-[var(--design-input-content)]',
              designFocusClassName,
            )}
            onPointerDown={(event) => event.preventDefault()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={clearField}
          >
            <BrushCleaning aria-hidden className="size-6" />
          </button>
        ) : null}
      </div>
      {showReset ? (
        <DesignButton
          type="button"
          appearance="tertiary"
          disabled={resetDisabled}
          onClick={resetField}
        >
          Reset to default
        </DesignButton>
      ) : null}
    </div>
  )
})
