import { appQueryClient } from '@/lib/shared/app-query-client'
import {
  fetchFiatProviderCurrenciesData,
  fiatProviderCurrenciesQueryKey,
  FIAT_PROVIDER_CURRENCIES_STALE_MS,
} from '@/lib/fiat/fiat-provider-currencies'
import type { FiatRateProviderId } from '@/lib/fiat/fiat-rate-service-whitelist'
import type { FiatCurrencyCode } from '@/lib/fiat/supported-fiat-currencies'

/** Ignores stale discovery responses when the provider changes quickly. */
let clampRequestGeneration = 0

export type FiatDenominationClampStoreSnapshot = {
  defaultFiatCurrency: FiatCurrencyCode
  fiatRateProvider: FiatRateProviderId
}

/**
 * After {@link fiatRateProviderId}'s discovery list loads, calls {@link clampToFallback}
 * when persisted `defaultFiatCurrency` is not in that list.
 */
export async function clampDefaultFiatCurrencyToProviderDiscovery(
  fiatRateProviderId: FiatRateProviderId,
  readFiatDenomination: () => FiatDenominationClampStoreSnapshot,
  clampToFallback: () => void,
): Promise<void> {
  const requestGeneration = ++clampRequestGeneration

  try {
    const providerSupportedFiatCurrencies = await appQueryClient.fetchQuery({
      queryKey: fiatProviderCurrenciesQueryKey(fiatRateProviderId),
      queryFn: () => fetchFiatProviderCurrenciesData(fiatRateProviderId),
      staleTime: FIAT_PROVIDER_CURRENCIES_STALE_MS,
    })

    if (requestGeneration !== clampRequestGeneration) return

    const { defaultFiatCurrency, fiatRateProvider } = readFiatDenomination()
    if (fiatRateProvider !== fiatRateProviderId) return

    const providerSupportedFiatCodes = providerSupportedFiatCurrencies.codes
    if (providerSupportedFiatCodes.length === 0) return
    if (providerSupportedFiatCodes.includes(defaultFiatCurrency)) return

    clampToFallback()
  } catch {
    /* Discovery failed — keep persisted currency; UI/rate fetch surface errors. */
  }
}
