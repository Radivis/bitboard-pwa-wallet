import {
  BitcoinAmountDisplay,
  type BitcoinAmountDisplaySize,
} from '@/components/BitcoinAmountDisplay'
import { FiatAmountDisplay } from '@/components/FiatAmountDisplay'
import type { FiatCurrencyCode } from '@/lib/fiat/supported-fiat-currencies'
import { cn } from '@/lib/shared/utils'

type FiatBtcAmountDisplayProps = {
  amountSats: number
  showFiatLayout: boolean
  btcPriceInFiat: number | null | undefined
  currency: FiatCurrencyCode
  isDetail?: boolean
  size?: BitcoinAmountDisplaySize
  rateLoading?: boolean
  className?: string
  'data-testid'?: string
}

function resolveFiatAndBtcSizes(
  isDetail: boolean,
  sizeOverride: BitcoinAmountDisplaySize | undefined,
): { fiatSize: BitcoinAmountDisplaySize; btcSize: BitcoinAmountDisplaySize } {
  if (sizeOverride != null) {
    return { fiatSize: sizeOverride, btcSize: sizeOverride }
  }
  if (isDetail) {
    return { fiatSize: 'lg', btcSize: 'md' }
  }
  return { fiatSize: 'sm', btcSize: 'sm' }
}

export function FiatBtcAmountDisplay({
  amountSats,
  showFiatLayout,
  btcPriceInFiat,
  currency,
  isDetail = true,
  size,
  rateLoading = false,
  className,
  'data-testid': dataTestId,
}: FiatBtcAmountDisplayProps) {
  const { fiatSize, btcSize } = resolveFiatAndBtcSizes(isDetail, size)
  const btcOnlySize = size ?? (isDetail ? 'lg' : 'sm')
  const useInheritedRowColor = className != null && className.length > 0

  if (!showFiatLayout) {
    return (
      <BitcoinAmountDisplay
        amountSats={amountSats}
        size={btcOnlySize}
        className={className}
        data-testid={dataTestId}
      />
    )
  }

  return (
    <span
      className={cn('inline-flex flex-wrap items-center', className)}
      data-testid={dataTestId != null ? `${dataTestId}-wrapper` : undefined}
    >
      <FiatAmountDisplay
        amountSats={amountSats}
        btcPriceInFiat={btcPriceInFiat}
        currency={currency}
        size={fiatSize}
        rateLoading={rateLoading}
        data-testid={dataTestId}
      />
      <span
        className={cn(
          'inline-flex items-center whitespace-nowrap',
          !useInheritedRowColor && 'text-muted-foreground',
        )}
        data-testid={dataTestId != null ? `${dataTestId}-btc-segment` : undefined}
      >
        <span aria-hidden className="mx-[1em]">
          ·
        </span>
        <BitcoinAmountDisplay
          amountSats={amountSats}
          size={btcSize}
        />
      </span>
    </span>
  )
}
