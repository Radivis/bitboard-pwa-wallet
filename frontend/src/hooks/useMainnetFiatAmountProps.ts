import { useMainnetFiatRatesQuery } from '@/hooks/useMainnetFiatRatesQuery'
import { isUsableBtcSpotPriceInFiat } from '@/lib/fiat/is-usable-btc-spot-price-in-fiat'
import type { FiatCurrencyCode } from '@/lib/fiat/supported-fiat-currencies'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

export type MainnetFiatAmountDisplayProps = {
  showFiatLayout: boolean
  btcPriceInFiat: number | null | undefined
  currency: FiatCurrencyCode
  rateLoading: boolean
}

export type MainnetFiatAmountProps = MainnetFiatAmountDisplayProps & {
  /** Mainnet and fiat denomination mode. Same gate as {@link MainnetFiatAmountDisplayProps.showFiatLayout}. */
  mainnetFiatEntry: boolean
  hasUsableFiatSpot: boolean
}

/** Shared mainnet fiat-denomination gate for balance display and amount entry. */
export function useMainnetFiatAmountProps(): MainnetFiatAmountProps {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const fiatDenominationMode = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.fiatDenominationMode,
  )
  const defaultFiatCurrency = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.defaultFiatCurrency,
  )
  const fiatRatesQuery = useMainnetFiatRatesQuery()
  const btcPriceInFiat = fiatRatesQuery.data?.btcPriceInFiat
  const mainnetFiatMode = networkMode === 'mainnet' && fiatDenominationMode

  return {
    showFiatLayout: mainnetFiatMode,
    btcPriceInFiat,
    currency: defaultFiatCurrency,
    rateLoading: fiatRatesQuery.isPending,
    mainnetFiatEntry: mainnetFiatMode,
    hasUsableFiatSpot: isUsableBtcSpotPriceInFiat(btcPriceInFiat),
  }
}
