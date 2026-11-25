import { Coins } from 'lucide-react'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { DesignInput } from '@/components/design/DesignInput'
import { fiatAmountInputPlaceholder } from '@/lib/fiat/format-fiat-display'
import { amountInputPlaceholderForUnit } from '@/lib/wallet/bitcoin-display-unit'
import {
  parseUniversalAmount,
  useUniversalAmountEntry,
  type UniversalAmountEntryOptions,
} from '@/lib/wallet/universal-amount'
import type { BitcoinDisplayUnit } from '@/lib/wallet/bitcoin-display-unit'

const BITCOIN_PRICE_UNAVAILABLE_MESSAGE = 'Bitcoin price is unavailable.'

export type UniversalAmountInputProps = {
  id?: string
  value: string
  onChange: (nextValue: string) => void
  /** Bitcoin-mode unit. Defaults to the Settings unit. Ignored while fiat denomination mode applies. */
  bitcoinUnit?: BitcoinDisplayUnit
  disabled?: boolean
  placeholder?: string
  inputTestId?: string
  previewTestId?: string
  priceUnavailableTestId?: string
  allowFetchWhenPortfolioZeroForReceivePage?: boolean
}

/** Bitcoin or fiat amount field. The active unit comes from Settings, an optional override, or fiat mode. */
export function UniversalAmountInput({
  id,
  value,
  onChange,
  bitcoinUnit,
  disabled,
  placeholder,
  inputTestId,
  previewTestId,
  priceUnavailableTestId,
  allowFetchWhenPortfolioZeroForReceivePage,
}: UniversalAmountInputProps) {
  const rateFetchOptions: UniversalAmountEntryOptions | undefined =
    allowFetchWhenPortfolioZeroForReceivePage
      ? { allowFetchWhenPortfolioZeroForReceivePage: true }
      : undefined
  const amountEntry = useUniversalAmountEntry(bitcoinUnit, rateFetchOptions)
  const parsedAmount = parseUniversalAmount(value, amountEntry)
  const previewAmountSats =
    parsedAmount.kind === 'sats' && parsedAmount.amountSats > 0 ? parsedAmount.amountSats : null
  const useWholeSats = amountEntry.mode === 'bitcoin' && amountEntry.bitcoinUnit === 'sat'
  const defaultPlaceholder =
    amountEntry.mode === 'fiat'
      ? fiatAmountInputPlaceholder(amountEntry.currency)
      : amountInputPlaceholderForUnit(amountEntry.bitcoinUnit)
  const showBitcoinPreview =
    amountEntry.mode === 'fiat' && amountEntry.hasUsableFiatSpot && previewAmountSats != null
  const showPriceUnavailable = amountEntry.mode === 'fiat' && !amountEntry.hasUsableFiatSpot

  return (
    <div className="space-y-1">
      <DesignInput
        id={id}
        type="text"
        leadingIcon={Coins}
        inputMode={useWholeSats ? 'numeric' : 'decimal'}
        autoComplete="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? defaultPlaceholder}
        onChange={(event) => {
          onChange(event.target.value)
        }}
        data-testid={inputTestId}
      />
      {showBitcoinPreview ? (
        <p className="design-type-regular text-muted-foreground" data-testid={previewTestId}>
          ≈{' '}
          <BitcoinAmountDisplay
            amountSats={previewAmountSats ?? 0}
            size="sm"
            className="inline"
            allowUnitToggle={false}
          />
        </p>
      ) : null}
      {showPriceUnavailable ? (
        <p className="design-type-regular text-destructive" data-testid={priceUnavailableTestId}>
          {BITCOIN_PRICE_UNAVAILABLE_MESSAGE}
        </p>
      ) : null}
    </div>
  )
}
