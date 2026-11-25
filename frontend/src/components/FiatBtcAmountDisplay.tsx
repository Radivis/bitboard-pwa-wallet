import type { ReactNode } from 'react'
import {
  BitcoinAmountDisplay,
  type BitcoinAmountDisplaySize,
} from '@/components/BitcoinAmountDisplay'
import { FiatAmountDisplay } from '@/components/FiatAmountDisplay'
import type { DesignAmountTypography } from '@/components/design/design-type'
import type { MainnetFiatAmountDisplayProps } from '@/hooks/useMainnetFiatAmountProps'
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
  fiatClassName?: string
  btcClassName?: string
  amountTypography?: DesignAmountTypography
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
    return { fiatSize: 'sm', btcSize: 'sm' }
  }
  return { fiatSize: 'lg', btcSize: 'md' }
}

export function FiatBtcAmountDisplay({
  amountSats,
  showFiatLayout,
  btcPriceInFiat,
  currency,
  isDetail = false,
  size,
  rateLoading = false,
  className,
  fiatClassName,
  btcClassName,
  amountTypography,
  'data-testid': dataTestId,
}: FiatBtcAmountDisplayProps) {
  const { fiatSize, btcSize } = resolveFiatAndBtcSizes(isDetail, size)
  const btcOnlySize = size ?? (isDetail ? 'sm' : 'lg')
  const useInheritedRowColor =
    (className != null && className.length > 0) ||
    (btcClassName != null && btcClassName.length > 0)

  if (!showFiatLayout) {
    return (
      <BitcoinAmountDisplay
        amountSats={amountSats}
        size={btcOnlySize}
        amountTypography={amountTypography}
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
        amountTypography={amountTypography}
        className={fiatClassName}
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
        <span aria-hidden className="mx-[0.7em]">
          ·
        </span>
        <BitcoinAmountDisplay
          amountSats={amountSats}
          size={btcSize}
          amountTypography={amountTypography}
          className={btcClassName}
        />
      </span>
    </span>
  )
}

type LabeledFiatBtcAmountProps = {
  label: ReactNode
  amountSats: number
  testId?: string
  className?: string
  amountTypography?: DesignAmountTypography
  fiat: MainnetFiatAmountDisplayProps
}

/** A detail row: label, then fiat and bitcoin for the same sat amount. */
export function LabeledFiatBtcAmount({
  label,
  amountSats,
  testId,
  className,
  amountTypography,
  fiat,
}: LabeledFiatBtcAmountProps) {
  return (
    <p className={className} data-testid={testId}>
      {label}{' '}
      <FiatBtcAmountDisplay
        amountSats={amountSats}
        showFiatLayout={fiat.showFiatLayout}
        btcPriceInFiat={fiat.btcPriceInFiat}
        currency={fiat.currency}
        rateLoading={fiat.rateLoading}
        amountTypography={amountTypography}
        isDetail
      />
    </p>
  )
}
