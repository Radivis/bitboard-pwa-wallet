import type { BitcoinAmountDisplaySize } from '@/components/BitcoinAmountDisplay'
import { cn } from '@/lib/utils'
import type { FiatCurrencyCode } from '@/lib/supported-fiat-currencies'
import { getFiatCurrencyUiMeta } from '@/lib/supported-fiat-currencies'
import { formatFiatFromSatsAndBtcPrice } from '@/lib/format-fiat-display'
import { isUsableBtcSpotPriceInFiat } from '@/lib/is-usable-btc-spot-price-in-fiat'

const SIZE_CLASSES: Record<BitcoinAmountDisplaySize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-3xl font-semibold',
}

type FiatAmountDisplayProps = {
  amountSats: number
  btcPriceInFiat: number | null | undefined
  currency: FiatCurrencyCode
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
  const unitLabel = getFiatCurrencyUiMeta(currency).label

  if (!isUsableBtcSpotPriceInFiat(btcPriceInFiat)) {
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
      {formatted}
    </span>
  )
}
