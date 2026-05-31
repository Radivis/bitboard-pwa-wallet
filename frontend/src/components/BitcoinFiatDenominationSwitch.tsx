import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/shared/utils'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { getFiatCurrencyUiMeta } from '@/lib/fiat/supported-fiat-currencies'

type BitcoinFiatDenominationSwitchProps = {
  disabled?: boolean
  className?: string
  /** Called when the user toggles (after state update). */
  onFiatModeChange?: (nextFiatMode: boolean) => void
}

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

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2',
        className,
      )}
    >
      <Label
        htmlFor="bitcoin-fiat-denomination-switch"
        className="flex flex-1 cursor-pointer items-center justify-between gap-3 text-sm font-medium"
      >
        <span className="tabular-nums" aria-hidden>
          ₿
        </span>
        <Switch
          id="bitcoin-fiat-denomination-switch"
          className="shrink-0"
          checked={fiatMode}
          onCheckedChange={(v) => {
            setFiatDenominationMode(v)
            onFiatModeChange?.(v)
          }}
          disabled={disabled}
          aria-label={`Denomination: ${fiatMode ? `${defaultFiatCurrency} (fiat)` : 'Bitcoin'}`}
        />
        <span className="tabular-nums" aria-hidden>
          {fiatSymbol}
        </span>
      </Label>
    </div>
  )
}
