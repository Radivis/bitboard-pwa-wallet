import { useQuery } from '@tanstack/react-query'
import type { FiatRateProviderId } from '@/lib/fiat-rate-service-whitelist'
import {
  fetchFiatProviderCurrenciesData,
  fiatProviderCurrenciesQueryKey,
  FIAT_PROVIDER_CURRENCIES_STALE_MS,
} from '@/lib/fiat-provider-currencies'

/**
 * Discover fiat codes supported by the selected public rate provider (proxied).
 * Kraken responses include `krakenPairByCode` for building ticker URLs.
 */
export function useFiatProviderSupportedCurrenciesQuery(
  provider: FiatRateProviderId,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false
  return useQuery({
    queryKey: fiatProviderCurrenciesQueryKey(provider),
    queryFn: () => fetchFiatProviderCurrenciesData(provider),
    staleTime: FIAT_PROVIDER_CURRENCIES_STALE_MS,
    enabled,
  })
}
