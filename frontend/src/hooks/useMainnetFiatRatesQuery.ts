import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { useLightningBalancesForDashboardQuery } from '@/hooks/useLightningMutations'
import type { FiatRateProviderId } from '@/lib/fiat/fiat-rate-service-whitelist'
import {
  buildMainnetFiatRateRequestUrl,
  parseFiatRateProviderResponse,
} from '@/lib/fiat/fiat-rate-client'
import {
  fetchFiatProviderCurrenciesData,
  fiatProviderCurrenciesQueryKey,
  FIAT_PROVIDER_CURRENCIES_STALE_MS,
} from '@/lib/fiat/fiat-provider-currencies'
import { errorMessage } from '@/lib/shared/utils'

export const MAINNET_FIAT_RATES_STALE_MS = 120_000

export function mainnetFiatRatesQueryKey(
  fiatCurrencyCode: string,
  fiatRateProviderId: FiatRateProviderId,
): readonly [string, string, FiatRateProviderId] {
  return ['mainnet-fiat-rates', fiatCurrencyCode, fiatRateProviderId] as const
}

function usePortfolioPositiveForFiatRatesFetch(): boolean {
  const balance = useWalletStore((walletState) => walletState.balance)
  const arkadeBalance = useWalletStore((walletState) => walletState.arkadeBalance)
  const lightningBalancesQuery = useLightningBalancesForDashboardQuery()
  const onChainTotalSats = balance?.totalSats ?? 0
  const lightningTotalSats = lightningBalancesQuery.data?.totalSats ?? 0
  const arkadeTotalSats = arkadeBalance?.totalSats ?? 0
  return onChainTotalSats > 0 || lightningTotalSats > 0 || arkadeTotalSats > 0
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
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const balance = useWalletStore((walletState) => walletState.balance)
  const fiatDenominationMode = useFiatDenominationStore((fiatDenominationState) => fiatDenominationState.fiatDenominationMode)
  const defaultFiatCurrency = useFiatDenominationStore((fiatDenominationState) => fiatDenominationState.defaultFiatCurrency)
  const fiatRateProviderId = useFiatDenominationStore((fiatDenominationState) => fiatDenominationState.fiatRateProvider)
  const portfolioHasPositiveBalance = usePortfolioPositiveForFiatRatesFetch()
  const allowFetchWhenPortfolioZeroForReceivePage =
    options?.allowFetchWhenPortfolioZeroForReceivePage === true

  const shouldFetchMainnetFiatRate =
    networkMode === 'mainnet' &&
    fiatDenominationMode &&
    walletIsUnlockedOrSyncing(walletStatus) &&
    balance != null &&
    (allowFetchWhenPortfolioZeroForReceivePage || portfolioHasPositiveBalance)

  return useQuery({
    queryKey: mainnetFiatRatesQueryKey(defaultFiatCurrency, fiatRateProviderId),
    queryFn: async () => {
      const providerSupportedFiatCurrencies = await queryClient.fetchQuery({
        queryKey: fiatProviderCurrenciesQueryKey(fiatRateProviderId),
        queryFn: () => fetchFiatProviderCurrenciesData(fiatRateProviderId),
        staleTime: FIAT_PROVIDER_CURRENCIES_STALE_MS,
      })

      let krakenTickerPairFromDiscovery: string | undefined
      if (fiatRateProviderId === 'kraken') {
        const normalizedDefaultFiatCode = defaultFiatCurrency.trim().toUpperCase()
        krakenTickerPairFromDiscovery =
          providerSupportedFiatCurrencies.krakenPairByCode[normalizedDefaultFiatCode]
        if (krakenTickerPairFromDiscovery == null) {
          throw new Error(
            'This fiat currency is not available from Kraken for price data',
          )
        }
      }

      const rateRequestUrl = buildMainnetFiatRateRequestUrl(
        fiatRateProviderId,
        defaultFiatCurrency,
        krakenTickerPairFromDiscovery,
      )
      const rateHttpResponse = await fetch(rateRequestUrl)
      if (!rateHttpResponse.ok) {
        throw new Error(`Fiat rate request failed (${rateHttpResponse.status})`)
      }
      const rateResponseBody: unknown = await rateHttpResponse.json()
      const parsedRate = parseFiatRateProviderResponse(
        fiatRateProviderId,
        defaultFiatCurrency,
        rateResponseBody,
      )
      if (parsedRate == null) {
        throw new Error('Unrecognized fiat rate response')
      }
      return parsedRate
    },
    enabled: shouldFetchMainnetFiatRate,
    staleTime: MAINNET_FIAT_RATES_STALE_MS,
  })
}

export function fiatRateQueryErrorMessage(err: unknown): string {
  return errorMessage(err) || 'Could not load exchange rate'
}
