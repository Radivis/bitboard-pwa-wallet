import { DesignSwitch } from '@/components/design/DesignSwitch'
import { getFiatCurrencyUiMeta } from '@/lib/fiat/supported-fiat-currencies'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'

type BitcoinFiatDenominationSwitchProps = {
  disabled?: boolean
  className?: string
  /** Called when the user toggles (after state update). */
  onFiatModeChange?: (nextFiatMode: boolean) => void
}

type DenominationValue = 'bitcoin' | 'fiat'

/**
 * Mainnet-only placement: shows ₿ vs the current default fiat symbol.
 * Parent should not render when not mainnet.
 */
export function BitcoinFiatDenominationSwitch({
  disabled,
  className,
  onFiatModeChange,
}: BitcoinFiatDenominationSwitchProps) {
  const fiatMode = useFiatDenominationStore((fiatDenominationState) => fiatDenominationState.fiatDenominationMode)
  const setFiatDenominationMode = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.setFiatDenominationMode,
  )
  const defaultFiatCurrency = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.defaultFiatCurrency,
  )
  const fiatSymbol = getFiatCurrencyUiMeta(defaultFiatCurrency).symbol

  function selectDenomination(next: DenominationValue) {
    const nextFiatMode = next === 'fiat'
    if (nextFiatMode === fiatMode) return
    setFiatDenominationMode(nextFiatMode)
    onFiatModeChange?.(nextFiatMode)
  }

  return (
    <DesignSwitch
      aria-label="Denomination"
      className={className}
      disabled={disabled}
      value={fiatMode ? 'fiat' : 'bitcoin'}
      onValueChange={selectDenomination}
      options={[
        { value: 'bitcoin', label: 'Bitcoin', icon: <span aria-hidden>₿</span> },
        {
          value: 'fiat',
          label: defaultFiatCurrency,
          icon: <span aria-hidden>{fiatSymbol}</span>,
        },
      ]}
    />
  )
}
