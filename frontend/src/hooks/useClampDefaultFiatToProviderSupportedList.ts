import { useEffect } from 'react'
import { useWalletStore } from '@/stores/walletStore'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { useFiatProviderSupportedCurrenciesQuery } from '@/hooks/useFiatProviderSupportedCurrenciesQuery'
import { DEFAULT_FIAT_FALLBACK } from '@/lib/supported-fiat-currencies'

/**
 * When mainnet fiat denomination is on, ensures persisted `defaultFiatCurrency` is in the
 * list returned by the selected rate provider (after discovery fetch).
 */
export function useClampDefaultFiatToProviderSupportedList(): void {
  const networkMode = useWalletStore((s) => s.networkMode)
  const fiatDenominationMode = useFiatDenominationStore((s) => s.fiatDenominationMode)
  const fiatRateProviderId = useFiatDenominationStore((s) => s.fiatRateProvider)
  const defaultFiatCurrency = useFiatDenominationStore(
    (s) => s.defaultFiatCurrency,
  )
  const setDefaultFiatCurrency = useFiatDenominationStore(
    (s) => s.setDefaultFiatCurrency,
  )

  const shouldLoadProviderFiatCodeList =
    networkMode === 'mainnet' && fiatDenominationMode
  const { data: providerSupportedFiatCurrencies, isSuccess: discoverySucceeded } =
    useFiatProviderSupportedCurrenciesQuery(fiatRateProviderId, {
      enabled: shouldLoadProviderFiatCodeList,
    })

  useEffect(() => {
    if (
      !shouldLoadProviderFiatCodeList ||
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
    shouldLoadProviderFiatCodeList,
    discoverySucceeded,
    providerSupportedFiatCurrencies,
    defaultFiatCurrency,
    setDefaultFiatCurrency,
  ])
}
