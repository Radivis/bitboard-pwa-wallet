import type { FiatRateProviderId } from '@/lib/fiat-rate-service-whitelist'
import { FIAT_SAME_ORIGIN_PROXY_PREFIX } from '@/lib/fiat-rate-service-whitelist'
import { isIso4217Alpha3 } from '@/lib/iso-4217-alpha3'

export const FIAT_PROVIDER_CURRENCIES_STALE_MS = 86_400_000

export const FIAT_PROVIDER_CURRENCIES_QUERY_KEY_PREFIX = 'fiat-provider-currencies' as const

export function fiatProviderCurrenciesQueryKey(
  fiatRateProviderId: FiatRateProviderId,
): readonly [typeof FIAT_PROVIDER_CURRENCIES_QUERY_KEY_PREFIX, FiatRateProviderId] {
  return [FIAT_PROVIDER_CURRENCIES_QUERY_KEY_PREFIX, fiatRateProviderId] as const
}

export type FiatProviderCurrenciesData = {
  /** Sorted uppercase ISO 4217 codes */
  codes: readonly string[]
  /** Kraken `Ticker?pair=` value per fiat code (only populated for Kraken discovery). */
  krakenPairByCode: Readonly<Record<string, string>>
}

const EMPTY_FIAT_PROVIDER_CURRENCIES: FiatProviderCurrenciesData = {
  codes: [],
  krakenPairByCode: {},
}

/**
 * Build same-origin proxied URL to discover supported fiat codes for the selected provider.
 */
export function buildFiatProviderCurrenciesDiscoveryUrl(
  fiatRateProviderId: FiatRateProviderId,
): string {
  const origin =
    typeof globalThis.location !== 'undefined' ? globalThis.location.origin : ''
  const proxyBaseUrl = `${origin}${FIAT_SAME_ORIGIN_PROXY_PREFIX}/${fiatRateProviderId}`
  switch (fiatRateProviderId) {
    case 'kraken':
      return `${proxyBaseUrl}/0/public/AssetPairs`
    case 'coingecko':
      return `${proxyBaseUrl}/api/v3/simple/supported_vs_currencies`
    case 'blockchain':
      return `${proxyBaseUrl}/ticker`
    default: {
      const _exhaustive: never = fiatRateProviderId
      return _exhaustive
    }
  }
}

type KrakenAssetPairRow = {
  status?: string
  wsname?: string
}

/**
 * Extract online XBT/fiat spot pairs from Kraken `AssetPairs` (`wsname` like `XBT/USD`).
 */
export function parseKrakenAssetPairsForBtcFiat(
  rawResponseBody: unknown,
): FiatProviderCurrenciesData {
  if (
    typeof rawResponseBody !== 'object' ||
    rawResponseBody === null ||
    !('result' in rawResponseBody) ||
    typeof (rawResponseBody as { result: unknown }).result !== 'object' ||
    (rawResponseBody as { result: object }).result === null
  ) {
    return EMPTY_FIAT_PROVIDER_CURRENCIES
  }

  const assetPairsByKrakenId = (rawResponseBody as {
    result: Record<string, KrakenAssetPairRow>
  }).result
  const krakenTickerPairKeyByFiatCode = new Map<string, string>()

  for (const [krakenAssetPairId, assetPairRow] of Object.entries(assetPairsByKrakenId)) {
    if (assetPairRow?.status !== 'online' || typeof assetPairRow.wsname !== 'string')
      continue
    const wsnameSegments = assetPairRow.wsname.split('/')
    if (wsnameSegments.length !== 2 || wsnameSegments[0] !== 'XBT') continue
    const quoteFiatCode = wsnameSegments[1]!
    if (!/^[A-Z]{3}$/.test(quoteFiatCode)) continue
    if (!krakenTickerPairKeyByFiatCode.has(quoteFiatCode)) {
      krakenTickerPairKeyByFiatCode.set(quoteFiatCode, krakenAssetPairId)
    }
  }

  const sortedFiatCurrencyCodes = [...krakenTickerPairKeyByFiatCode.keys()].sort((a, b) =>
    a.localeCompare(b),
  )
  return {
    codes: sortedFiatCurrencyCodes,
    krakenPairByCode: Object.fromEntries(krakenTickerPairKeyByFiatCode),
  }
}

/**
 * Intersect CoinGecko `simple/supported_vs_currencies` with ISO 4217 alpha-3.
 */
export function parseCoinGeckoSupportedVsCurrencies(
  rawResponseBody: unknown,
): FiatProviderCurrenciesData {
  if (!Array.isArray(rawResponseBody)) return EMPTY_FIAT_PROVIDER_CURRENCIES

  const fiatCurrencyCodes: string[] = []
  for (const rawVsCurrencyId of rawResponseBody) {
    if (typeof rawVsCurrencyId !== 'string') continue
    const uppercaseFiatCode = rawVsCurrencyId.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(uppercaseFiatCode) || !isIso4217Alpha3(uppercaseFiatCode))
      continue
    fiatCurrencyCodes.push(uppercaseFiatCode)
  }

  const sortedUniqueFiatCodes = [...new Set(fiatCurrencyCodes)].sort((a, b) =>
    a.localeCompare(b),
  )
  return { codes: sortedUniqueFiatCodes, krakenPairByCode: {} }
}

/**
 * Use Blockchain ticker top-level keys as fiat codes, filtered by ISO 4217.
 */
export function parseBlockchainTickerKeys(
  rawResponseBody: unknown,
): FiatProviderCurrenciesData {
  if (typeof rawResponseBody !== 'object' || rawResponseBody === null) {
    return EMPTY_FIAT_PROVIDER_CURRENCIES
  }

  const fiatCurrencyCodes: string[] = []
  for (const tickerTopLevelKey of Object.keys(
    rawResponseBody as Record<string, unknown>,
  )) {
    const uppercaseFiatCode = tickerTopLevelKey.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(uppercaseFiatCode) || !isIso4217Alpha3(uppercaseFiatCode))
      continue
    fiatCurrencyCodes.push(uppercaseFiatCode)
  }

  const sortedUniqueFiatCodes = [...new Set(fiatCurrencyCodes)].sort((a, b) =>
    a.localeCompare(b),
  )
  return { codes: sortedUniqueFiatCodes, krakenPairByCode: {} }
}

export function parseFiatProviderCurrenciesResponse(
  fiatRateProviderId: FiatRateProviderId,
  rawResponseBody: unknown,
): FiatProviderCurrenciesData {
  switch (fiatRateProviderId) {
    case 'kraken':
      return parseKrakenAssetPairsForBtcFiat(rawResponseBody)
    case 'coingecko':
      return parseCoinGeckoSupportedVsCurrencies(rawResponseBody)
    case 'blockchain':
      return parseBlockchainTickerKeys(rawResponseBody)
    default: {
      const _exhaustive: never = fiatRateProviderId
      return _exhaustive
    }
  }
}

/**
 * Fetch + parse discovery JSON for a provider (for TanStack `queryFn` and `fetchQuery`).
 */
export async function fetchFiatProviderCurrenciesData(
  fiatRateProviderId: FiatRateProviderId,
): Promise<FiatProviderCurrenciesData> {
  const discoveryUrl = buildFiatProviderCurrenciesDiscoveryUrl(fiatRateProviderId)
  const discoveryHttpResponse = await fetch(discoveryUrl)
  if (!discoveryHttpResponse.ok) {
    throw new Error(`Fiat currency list request failed (${discoveryHttpResponse.status})`)
  }
  const parsedResponseBody: unknown = await discoveryHttpResponse.json()
  return parseFiatProviderCurrenciesResponse(fiatRateProviderId, parsedResponseBody)
}
