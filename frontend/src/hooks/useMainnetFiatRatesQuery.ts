import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { useLightningBalancesForDashboardQuery } from '@/hooks/useLightningMutations'
import type { FiatRateProviderId } from '@/lib/fiat-rate-service-whitelist'
import {
  buildMainnetFiatRateRequestUrl,
  parseFiatRateProviderResponse,
} from '@/lib/fiat-rate-client'
import {
  fetchFiatProviderCurrenciesData,
  fiatProviderCurrenciesQueryKey,
  FIAT_PROVIDER_CURRENCIES_STALE_MS,
} from '@/lib/fiat-provider-currencies'
import { errorMessage } from '@/lib/utils'

export const MAINNET_FIAT_RATES_STALE_MS = 120_000

export function mainnetFiatRatesQueryKey(
  currency: string,
  provider: FiatRateProviderId,
): readonly [string, string, FiatRateProviderId] {
  return ['mainnet-fiat-rates', currency, provider] as const
}

function usePortfolioPositiveForFiatRatesFetch(): boolean {
  const balance = useWalletStore((s) => s.balance)
  const lnQuery = useLightningBalancesForDashboardQuery()
  const onChainTotal = balance?.total ?? 0
  const lnTotal = lnQuery.data?.totalSats ?? 0
  return onChainTotal > 0 || lnTotal > 0
}

/**
 * Fetches BTC spot price in {@link defaultFiatCurrency} from the selected public provider
 * (proxied). Gated by mainnet + fiat mode + wallet loaded + positive portfolio, unless
 * {@link allowFetchWhenPortfolioZeroForReceivePage} is true (Receive page only).
 */
export function useMainnetFiatRatesQuery(options?: {
  allowFetchWhenPortfolioZeroForReceivePage?: boolean
}) {
  const queryClient = useQueryClient()
  const networkMode = useWalletStore((s) => s.networkMode)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const balance = useWalletStore((s) => s.balance)
  const fiatMode = useFiatDenominationStore((s) => s.fiatDenominationMode)
  const currency = useFiatDenominationStore((s) => s.defaultFiatCurrency)
  const provider = useFiatDenominationStore((s) => s.fiatRateProvider)
  const portfolioPositive = usePortfolioPositiveForFiatRatesFetch()
  const allowZero = options?.allowFetchWhenPortfolioZeroForReceivePage === true

  const enabled =
    networkMode === 'mainnet' &&
    fiatMode &&
    (walletStatus === 'unlocked' || walletStatus === 'syncing') &&
    balance != null &&
    (allowZero || portfolioPositive)

  return useQuery({
    queryKey: mainnetFiatRatesQueryKey(currency, provider),
    queryFn: async () => {
      const discovery = await queryClient.fetchQuery({
        queryKey: fiatProviderCurrenciesQueryKey(provider),
        queryFn: () => fetchFiatProviderCurrenciesData(provider),
        staleTime: FIAT_PROVIDER_CURRENCIES_STALE_MS,
      })

      let krakenPair: string | undefined
      if (provider === 'kraken') {
        const code = currency.trim().toUpperCase()
        krakenPair = discovery.krakenPairByCode[code]
        if (krakenPair == null) {
          throw new Error(
            'This fiat currency is not available from Kraken for price data',
          )
        }
      }

      const url = buildMainnetFiatRateRequestUrl(provider, currency, krakenPair)
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Fiat rate request failed (${res.status})`)
      }
      const json: unknown = await res.json()
      const parsed = parseFiatRateProviderResponse(provider, currency, json)
      if (parsed == null) {
        throw new Error('Unrecognized fiat rate response')
      }
      return parsed
    },
    enabled,
    staleTime: MAINNET_FIAT_RATES_STALE_MS,
  })
}

export function fiatRateQueryErrorMessage(err: unknown): string {
  return errorMessage(err) || 'Could not load exchange rate'
}
