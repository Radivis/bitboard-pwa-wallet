import type { BitcoinAmountDisplaySize } from '@/components/BitcoinAmountDisplay'
import { cn } from '@/lib/utils'
import type { SupportedDefaultFiatCurrency } from '@/lib/supported-fiat-currencies'
import { FIAT_CURRENCY_UI } from '@/lib/supported-fiat-currencies'
import { formatFiatFromSatsAndBtcPrice } from '@/lib/format-fiat-display'

const SIZE_CLASSES: Record<BitcoinAmountDisplaySize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-3xl font-semibold',
}

type FiatAmountDisplayProps = {
  amountSats: number
  btcPriceInFiat: number | null | undefined
  currency: SupportedDefaultFiatCurrency
  size?: BitcoinAmountDisplaySize
  className?: string
  tabular?: boolean
  'data-testid'?: string
  /** When true and price is missing, show loading hint instead of em dash only. */
  rateLoading?: boolean
}

export function FiatAmountDisplay({
  amountSats,
  btcPriceInFiat,
  currency,
  size = 'md',
  className,
  tabular = true,
  'data-testid': dataTestId,
  rateLoading = false,
}: FiatAmountDisplayProps) {
  const numericClass = cn(SIZE_CLASSES[size], tabular && 'tabular-nums')
  const unitLabel = FIAT_CURRENCY_UI[currency].label

  if (btcPriceInFiat == null || !(btcPriceInFiat > 0)) {
    return (
      <span
        data-testid={dataTestId}
        className={cn(numericClass, 'text-muted-foreground', className)}
      >
        {rateLoading ? '…' : '—'} <span className="font-medium">{currency}</span>
      </span>
    )
  }

  const formatted = formatFiatFromSatsAndBtcPrice(
    amountSats,
    btcPriceInFiat,
    currency,
  )

  return (
    <span
      data-testid={dataTestId}
      className={cn(numericClass, className)}
      title={unitLabel}
    >
      <span className={cn(tabular && 'tabular-nums')}>{formatted}</span>
    </span>
  )
}
