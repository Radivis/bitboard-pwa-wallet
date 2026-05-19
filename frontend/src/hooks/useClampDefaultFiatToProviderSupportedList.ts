import { useEffect } from 'react'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { useFiatProviderSupportedCurrenciesQuery } from '@/hooks/useFiatProviderSupportedCurrenciesQuery'
import { DEFAULT_FIAT_FALLBACK } from '@/lib/supported-fiat-currencies'

/**
 * When the selected rate provider changes (or its discovery list loads), ensures
 * persisted `defaultFiatCurrency` is among the codes that provider supports.
 */
export function useClampDefaultFiatToProviderSupportedList(): void {
  const fiatRateProviderId = useFiatDenominationStore((s) => s.fiatRateProvider)
  const defaultFiatCurrency = useFiatDenominationStore(
    (s) => s.defaultFiatCurrency,
  )
  const setDefaultFiatCurrency = useFiatDenominationStore(
    (s) => s.setDefaultFiatCurrency,
  )

  const { data: providerSupportedFiatCurrencies, isSuccess: discoverySucceeded } =
    useFiatProviderSupportedCurrenciesQuery(fiatRateProviderId)

  useEffect(() => {
    if (
      !discoverySucceeded ||
      providerSupportedFiatCurrencies == null ||
      providerSupportedFiatCurrencies.codes.length === 0
    ) {
      return
    }
    if (!providerSupportedFiatCurrencies.codes.includes(defaultFiatCurrency)) {
      setDefaultFiatCurrency(DEFAULT_FIAT_FALLBACK)
    }
  }, [
    fiatRateProviderId,
    discoverySucceeded,
    providerSupportedFiatCurrencies,
    defaultFiatCurrency,
    setDefaultFiatCurrency,
  ])
}
