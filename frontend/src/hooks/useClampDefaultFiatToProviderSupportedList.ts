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
  const fiatMode = useFiatDenominationStore((s) => s.fiatDenominationMode)
  const provider = useFiatDenominationStore((s) => s.fiatRateProvider)
  const defaultFiatCurrency = useFiatDenominationStore(
    (s) => s.defaultFiatCurrency,
  )
  const setDefaultFiatCurrency = useFiatDenominationStore(
    (s) => s.setDefaultFiatCurrency,
  )

  const enabled = networkMode === 'mainnet' && fiatMode
  const { data, isSuccess } = useFiatProviderSupportedCurrenciesQuery(provider, {
    enabled,
  })

  useEffect(() => {
    if (!enabled || !isSuccess || data == null || data.codes.length === 0) return
    if (!data.codes.includes(defaultFiatCurrency)) {
      setDefaultFiatCurrency(DEFAULT_FIAT_FALLBACK)
    }
  }, [
    enabled,
    isSuccess,
    data,
    defaultFiatCurrency,
    setDefaultFiatCurrency,
  ])
}
