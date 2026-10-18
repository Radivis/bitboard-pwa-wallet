import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { FiatBtcAmountDisplay } from '@/components/FiatBtcAmountDisplay'
import { Input } from '@/components/ui/input'
import type { MainnetFiatAmountDisplayProps } from '@/hooks/useMainnetFiatAmountProps'
import { BARK_BITCOIN_PRICE_UNAVAILABLE_MESSAGE } from '@/lib/bark/bark-denomination-amount'
import { fiatAmountInputPlaceholder } from '@/lib/fiat/format-fiat-display'
import type { FiatCurrencyCode } from '@/lib/fiat/supported-fiat-currencies'

type BarkDenominationAmountFieldProps = {
  satsLabel: string
  fiatLabel: string
  amountRaw: string
  onAmountChange: (nextAmountRaw: string) => void
  inputTestId: string
  priceUnavailableTestId: string
  btcPreviewTestId: string
  mainnetFiatEntry: boolean
  hasUsableFiatSpot: boolean
  currency: FiatCurrencyCode
  parsedAmountSats: number | null
}

export function BarkDenominationAmountField({
  satsLabel,
  fiatLabel,
  amountRaw,
  onAmountChange,
  inputTestId,
  priceUnavailableTestId,
  btcPreviewTestId,
  mainnetFiatEntry,
  hasUsableFiatSpot,
  currency,
  parsedAmountSats,
}: BarkDenominationAmountFieldProps) {
  const useFiatField = mainnetFiatEntry && hasUsableFiatSpot
  const fiatPriceUnavailable = mainnetFiatEntry && !hasUsableFiatSpot

  return (
    <label className="block space-y-1 text-sm">
      <span>{mainnetFiatEntry ? fiatLabel : satsLabel}</span>
      <Input
        inputMode={mainnetFiatEntry ? 'decimal' : 'numeric'}
        value={amountRaw}
        placeholder={mainnetFiatEntry ? fiatAmountInputPlaceholder(currency) : undefined}
        onChange={(event) => {
          onAmountChange(event.target.value)
        }}
        data-testid={inputTestId}
      />
      {useFiatField && parsedAmountSats != null ? (
        <p className="text-sm text-muted-foreground" data-testid={btcPreviewTestId}>
          ≈{' '}
          <BitcoinAmountDisplay
            amountSats={parsedAmountSats}
            size="sm"
            className="inline"
            allowUnitToggle={false}
          />
        </p>
      ) : null}
      {fiatPriceUnavailable ? (
        <p className="text-sm text-destructive" data-testid={priceUnavailableTestId}>
          {BARK_BITCOIN_PRICE_UNAVAILABLE_MESSAGE}
        </p>
      ) : null}
    </label>
  )
}

type BarkReviewedAmountLineProps = {
  label: string
  amountSats: number
  testId: string
  fiat: MainnetFiatAmountDisplayProps
}

export function BarkReviewedAmountLine({
  label,
  amountSats,
  testId,
  fiat,
}: BarkReviewedAmountLineProps) {
  return (
    <p data-testid={testId}>
      {label}{' '}
      <FiatBtcAmountDisplay
        amountSats={amountSats}
        showFiatLayout={fiat.showFiatLayout}
        btcPriceInFiat={fiat.btcPriceInFiat}
        currency={fiat.currency}
        rateLoading={fiat.rateLoading}
        isDetail
      />
    </p>
  )
}
