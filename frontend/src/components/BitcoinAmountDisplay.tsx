import { useCallback, useEffect, useRef, useState } from 'react'
import type { BitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import {
  BITCOIN_DISPLAY_UNIT_LABEL,
  formatAmountInBitcoinDisplayUnit,
  getAccessibleBitcoinDisplayUnitLabel,
  getNetworkUnitIndicator,
} from '@/lib/bitcoin-display-unit'
import { useBitcoinUnit } from '@/hooks/useBitcoinUnit'
import { BitcoinUnitSelect } from '@/components/BitcoinUnitSelect'
import { NetworkUnitPrefix } from '@/components/NetworkUnitPrefix'
import { cn } from '@/lib/utils'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

export type BitcoinAmountDisplaySize = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<BitcoinAmountDisplaySize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-3xl font-semibold',
}

type BitcoinAmountDisplayProps = {
  amountSats: number
  size?: BitcoinAmountDisplaySize
  className?: string
  /** When true (default), use tabular figures for the numeric part. */
  tabular?: boolean
  /**
   * When false, the unit is plain text (no tap-to-change). Use inside buttons/links
   * to avoid invalid nested interactive elements.
   */
  allowUnitToggle?: boolean
  'data-testid'?: string
}

export function BitcoinAmountDisplay({
  amountSats,
  size = 'md',
  className,
  tabular = true,
  allowUnitToggle = true,
  'data-testid': dataTestId,
}: BitcoinAmountDisplayProps) {
  const { data: defaultUnit = 'BTC' } = useBitcoinUnit()
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const networkUnitIndicator = getNetworkUnitIndicator(networkMode)
  const [localUnitOverride, setLocalUnitOverride] =
    useState<BitcoinDisplayUnit | null>(null)
  const [isSelectingUnit, setIsSelectingUnit] = useState(false)
  const selectRef = useRef<HTMLSelectElement>(null)

  const effectiveUnit = localUnitOverride ?? defaultUnit
  const formatted = formatAmountInBitcoinDisplayUnit(amountSats, effectiveUnit)
  const unitLabel = BITCOIN_DISPLAY_UNIT_LABEL[effectiveUnit]
  const accessibleUnitLabel = getAccessibleBitcoinDisplayUnitLabel(
    effectiveUnit,
    networkMode,
  )

  useEffect(() => {
    if (isSelectingUnit && selectRef.current) {
      selectRef.current.focus()
    }
  }, [isSelectingUnit])

  const onUnitPicked = useCallback((unit: BitcoinDisplayUnit) => {
    setLocalUnitOverride(unit)
    setIsSelectingUnit(false)
  }, [])

  /** Parent `<Link>` / row click targets must not receive these — they would navigate instead of changing unit. */
  const stopParentPointer = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation()
  }, [])

  const interactiveUnit = allowUnitToggle
  const passThroughForParentLink = interactiveUnit
  const numericClass = cn(SIZE_CLASSES[size], tabular && 'tabular-nums')

  return (
    <span
      data-testid={dataTestId}
      className={cn(
        numericClass,
        className,
        passThroughForParentLink && 'pointer-events-none',
      )}
    >
      <span
        className={cn(
          tabular && 'tabular-nums',
          passThroughForParentLink && 'pointer-events-none',
        )}
      >
        {formatted}
      </span>{' '}
      {!allowUnitToggle ? (
        <span className={cn('font-medium', tabular && 'tabular-nums')}>
          <NetworkUnitPrefix indicator={networkUnitIndicator} />
          {unitLabel}
        </span>
      ) : isSelectingUnit ? (
        <span className="pointer-events-auto inline-flex items-baseline gap-0 align-middle">
          <NetworkUnitPrefix indicator={networkUnitIndicator} />
          <BitcoinUnitSelect
            ref={selectRef}
            value={effectiveUnit}
            onChange={onUnitPicked}
            onBlur={() => setIsSelectingUnit(false)}
            onPointerDown={stopParentPointer}
            onMouseDown={stopParentPointer}
            onClick={stopParentPointer}
            className="inline-flex max-w-[7rem] text-[length:inherit] font-[inherit]"
            aria-label="Display unit for this amount"
          />
        </span>
      ) : (
        <button
          type="button"
          aria-label={accessibleUnitLabel}
          className={cn(
            'pointer-events-auto inline rounded px-0.5 font-medium underline decoration-dotted underline-offset-2 hover:bg-muted/60',
            tabular && 'tabular-nums',
          )}
          onClick={(e) => {
            stopParentPointer(e)
            setIsSelectingUnit(true)
          }}
          onPointerDown={stopParentPointer}
          onMouseDown={stopParentPointer}
        >
          <NetworkUnitPrefix indicator={networkUnitIndicator} />
          {unitLabel}
        </button>
      )}
    </span>
  )
}
