import { Coins } from 'lucide-react'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { DesignInput } from '@/components/design/DesignInput'
import type { MainnetFiatAmountProps } from '@/hooks/useMainnetFiatAmountProps'
import { fiatAmountInputPlaceholder } from '@/lib/fiat/format-fiat-display'

const BITCOIN_PRICE_UNAVAILABLE_MESSAGE = 'Bitcoin price is unavailable.'

type SatsOrFiatAmountEntry = Pick<
  MainnetFiatAmountProps,
  'mainnetFiatEntry' | 'hasUsableFiatSpot' | 'currency'
>

type SatsOrFiatAmountFieldProps = {
  satsLabel: string
  fiatLabel: string
  amountRaw: string
  onAmountChange: (nextAmountRaw: string) => void
  inputTestId: string
  priceUnavailableTestId: string
  btcPreviewTestId: string
  fiat: SatsOrFiatAmountEntry
  parsedAmountSats: number | null
}

/** Amount entry that follows the mainnet fiat denomination switch. */
export function SatsOrFiatAmountField({
  satsLabel,
  fiatLabel,
  amountRaw,
  onAmountChange,
  inputTestId,
  priceUnavailableTestId,
  btcPreviewTestId,
  fiat,
  parsedAmountSats,
}: SatsOrFiatAmountFieldProps) {
  const useFiatField = fiat.mainnetFiatEntry && fiat.hasUsableFiatSpot
  const fiatPriceUnavailable = fiat.mainnetFiatEntry && !fiat.hasUsableFiatSpot

  return (
    <label className="design-type-regular block space-y-1">
      <span>{fiat.mainnetFiatEntry ? fiatLabel : satsLabel}</span>
      <DesignInput
        leadingIcon={Coins}
        inputMode={fiat.mainnetFiatEntry ? 'decimal' : 'numeric'}
        value={amountRaw}
        placeholder={
          fiat.mainnetFiatEntry ? fiatAmountInputPlaceholder(fiat.currency) : undefined
        }
        onChange={(event) => {
          onAmountChange(event.target.value)
        }}
        data-testid={inputTestId}
      />
      {useFiatField && parsedAmountSats != null ? (
        <p className="design-type-regular text-muted-foreground" data-testid={btcPreviewTestId}>
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
        <p className="design-type-regular text-destructive" data-testid={priceUnavailableTestId}>
          {BITCOIN_PRICE_UNAVAILABLE_MESSAGE}
        </p>
      ) : null}
    </label>
  )
}
