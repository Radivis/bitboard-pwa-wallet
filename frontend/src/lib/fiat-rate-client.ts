import type { FiatRateProviderId } from '@/lib/fiat-rate-service-whitelist'
import { FIAT_SAME_ORIGIN_PROXY_PREFIX } from '@/lib/fiat-rate-service-whitelist'
import { fiatCurrencyToTickerKey } from '@/lib/supported-fiat-currencies'

/**
 * Build proxied URL for BTC spot in `fiatCurrencyCode` (uppercase ISO 4217).
 * Kraken requires {@link krakenTickerPairFromDiscovery} from `AssetPairs` discovery (`Ticker?pair=` value).
 */
export function buildMainnetFiatRateRequestUrl(
  fiatRateProviderId: FiatRateProviderId,
  fiatCurrencyCode: string,
  krakenTickerPairFromDiscovery?: string,
): string {
  const origin =
    typeof globalThis.location !== 'undefined'
      ? globalThis.location.origin
      : ''
  const proxyBaseUrl = `${origin}${FIAT_SAME_ORIGIN_PROXY_PREFIX}/${fiatRateProviderId}`
  const coingeckoVsCurrencyKey = fiatCurrencyToTickerKey(fiatCurrencyCode)
  switch (fiatRateProviderId) {
    case 'kraken': {
      if (krakenTickerPairFromDiscovery == null || krakenTickerPairFromDiscovery === '') {
        throw new Error('Kraken ticker pair is required for fiat rate request')
      }
      return `${proxyBaseUrl}/0/public/Ticker?pair=${encodeURIComponent(krakenTickerPairFromDiscovery)}`
    }
    case 'coingecko':
      return `${proxyBaseUrl}/api/v3/simple/price?ids=bitcoin&vs_currencies=${encodeURIComponent(coingeckoVsCurrencyKey)}`
    case 'blockchain':
      return `${proxyBaseUrl}/ticker`
    default: {
      const _exhaustive: never = fiatRateProviderId
      return _exhaustive
    }
  }
}

export type ParsedBtcPriceInFiat = {
  btcPriceInFiat: number
}

export function parseFiatRateProviderResponse(
  fiatRateProviderId: FiatRateProviderId,
  fiatCurrencyCode: string,
  rawResponseBody: unknown,
): ParsedBtcPriceInFiat | null {
  const fiatCurrencyCodeUpper = fiatCurrencyCode.trim().toUpperCase()
  const coingeckoVsCurrencyKey = fiatCurrencyToTickerKey(fiatCurrencyCode)
  switch (fiatRateProviderId) {
    case 'coingecko': {
      if (
        typeof rawResponseBody !== 'object' ||
        rawResponseBody === null ||
        !('bitcoin' in rawResponseBody) ||
        typeof (rawResponseBody as { bitcoin: unknown }).bitcoin !== 'object' ||
        (rawResponseBody as { bitcoin: object }).bitcoin === null
      ) {
        return null
      }
      const coingeckoBitcoinRow = (rawResponseBody as { bitcoin: Record<string, unknown> })
        .bitcoin
      const rawBtcPriceInVsCurrency = coingeckoBitcoinRow[coingeckoVsCurrencyKey]
      const parsedBtcPrice =
        typeof rawBtcPriceInVsCurrency === 'number'
          ? rawBtcPriceInVsCurrency
          : typeof rawBtcPriceInVsCurrency === 'string'
            ? Number(rawBtcPriceInVsCurrency)
            : NaN
      return Number.isFinite(parsedBtcPrice) && parsedBtcPrice > 0
        ? { btcPriceInFiat: parsedBtcPrice }
        : null
    }
    case 'blockchain': {
      if (typeof rawResponseBody !== 'object' || rawResponseBody === null) return null
      const currencyTickerRow = (rawResponseBody as Record<string, { last?: unknown }>)[
        fiatCurrencyCodeUpper
      ]
      if (currencyTickerRow == null || typeof currencyTickerRow !== 'object') return null
      const lastPriceField = currencyTickerRow.last
      const parsedBtcPrice =
        typeof lastPriceField === 'number'
          ? lastPriceField
          : typeof lastPriceField === 'string'
            ? Number(lastPriceField)
            : NaN
      return Number.isFinite(parsedBtcPrice) && parsedBtcPrice > 0
        ? { btcPriceInFiat: parsedBtcPrice }
        : null
    }
    case 'kraken': {
      if (
        typeof rawResponseBody !== 'object' ||
        rawResponseBody === null ||
        !('result' in rawResponseBody) ||
        typeof (rawResponseBody as { result: unknown }).result !== 'object' ||
        (rawResponseBody as { result: object }).result === null
      ) {
        return null
      }
      const krakenTickerResult = (rawResponseBody as { result: Record<string, unknown> })
        .result
      const krakenPairKeys = Object.keys(krakenTickerResult)
      if (krakenPairKeys.length === 0) return null
      const firstPairTickerRow = krakenTickerResult[krakenPairKeys[0]!]
      if (typeof firstPairTickerRow !== 'object' || firstPairTickerRow === null || !('c' in firstPairTickerRow))
        return null
      const lastTradePriceTuple = (firstPairTickerRow as { c: unknown }).c
      if (!Array.isArray(lastTradePriceTuple) || lastTradePriceTuple.length < 1) return null
      const lastClosePriceRaw = lastTradePriceTuple[0]
      const parsedBtcPrice =
        typeof lastClosePriceRaw === 'string'
          ? Number(lastClosePriceRaw)
          : typeof lastClosePriceRaw === 'number'
            ? lastClosePriceRaw
            : NaN
      return Number.isFinite(parsedBtcPrice) && parsedBtcPrice > 0
        ? { btcPriceInFiat: parsedBtcPrice }
        : null
    }
    default: {
      const _exhaustive: never = fiatRateProviderId
      return _exhaustive
    }
  }
}
