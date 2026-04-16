import { forwardRef } from 'react'
import type {
  FocusEventHandler,
  MouseEventHandler,
  PointerEventHandler,
} from 'react'
import type { BitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import {
  BITCOIN_DISPLAY_UNITS,
  BITCOIN_DISPLAY_UNIT_LABEL,
} from '@/lib/bitcoin-display-unit'
import { cn } from '@/lib/utils'

export type BitcoinUnitSelectProps = {
  id?: string
  value: BitcoinDisplayUnit
  onChange: (unit: BitcoinDisplayUnit) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
  onBlur?: FocusEventHandler<HTMLSelectElement>
  onPointerDown?: PointerEventHandler<HTMLSelectElement>
  onMouseDown?: MouseEventHandler<HTMLSelectElement>
  onClick?: MouseEventHandler<HTMLSelectElement>
}

export const BitcoinUnitSelect = forwardRef<
  HTMLSelectElement,
  BitcoinUnitSelectProps
>(function BitcoinUnitSelect(
  {
    id,
    value,
    onChange,
    disabled,
    className,
    'aria-label': ariaLabel,
    onBlur,
    onPointerDown,
    onMouseDown,
    onClick,
  },
  ref,
) {
  return (
    <select
      ref={ref}
      id={id}
      onBlur={onBlur}
      onPointerDown={onPointerDown}
      onMouseDown={onMouseDown}
      onClick={onClick}
      className={cn(
        'rounded-md border border-input bg-background px-2 py-1 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel ?? 'Bitcoin amount unit'}
      onChange={(e) => onChange(e.target.value as BitcoinDisplayUnit)}
    >
      {BITCOIN_DISPLAY_UNITS.map((unit) => (
        <option key={unit} value={unit}>
          {BITCOIN_DISPLAY_UNIT_LABEL[unit]}
        </option>
      ))}
    </select>
  )
})
