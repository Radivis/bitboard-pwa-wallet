import type { FiatRateProviderId } from '@/lib/fiat-rate-service-whitelist'
import { FIAT_SAME_ORIGIN_PROXY_PREFIX } from '@/lib/fiat-rate-service-whitelist'
import { isIso4217Alpha3 } from '@/lib/iso-4217-alpha3'

export const FIAT_PROVIDER_CURRENCIES_STALE_MS = 86_400_000

export const FIAT_PROVIDER_CURRENCIES_QUERY_KEY_PREFIX = 'fiat-provider-currencies' as const

export function fiatProviderCurrenciesQueryKey(
  provider: FiatRateProviderId,
): readonly [typeof FIAT_PROVIDER_CURRENCIES_QUERY_KEY_PREFIX, FiatRateProviderId] {
  return [FIAT_PROVIDER_CURRENCIES_QUERY_KEY_PREFIX, provider] as const
}

export type FiatProviderCurrenciesData = {
  /** Sorted uppercase ISO 4217 codes */
  codes: readonly string[]
  /** Kraken `Ticker?pair=` value per fiat code (only populated for Kraken discovery). */
  krakenPairByCode: Readonly<Record<string, string>>
}

const EMPTY_DATA: FiatProviderCurrenciesData = {
  codes: [],
  krakenPairByCode: {},
}

/**
 * Build same-origin proxied URL to discover supported fiat codes for the selected provider.
 */
export function buildFiatProviderCurrenciesDiscoveryUrl(
  provider: FiatRateProviderId,
): string {
  const origin =
    typeof globalThis.location !== 'undefined' ? globalThis.location.origin : ''
  const base = `${origin}${FIAT_SAME_ORIGIN_PROXY_PREFIX}/${provider}`
  switch (provider) {
    case 'kraken':
      return `${base}/0/public/AssetPairs`
    case 'coingecko':
      return `${base}/api/v3/simple/supported_vs_currencies`
    case 'blockchain':
      return `${base}/ticker`
    default: {
      const _x: never = provider
      return _x
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
  json: unknown,
): FiatProviderCurrenciesData {
  if (
    typeof json !== 'object' ||
    json === null ||
    !('result' in json) ||
    typeof (json as { result: unknown }).result !== 'object' ||
    (json as { result: object }).result === null
  ) {
    return EMPTY_DATA
  }

  const result = (json as { result: Record<string, KrakenAssetPairRow> }).result
  const pairByCode = new Map<string, string>()

  for (const [pairKey, row] of Object.entries(result)) {
    if (row?.status !== 'online' || typeof row.wsname !== 'string') continue
    const parts = row.wsname.split('/')
    if (parts.length !== 2 || parts[0] !== 'XBT') continue
    const quote = parts[1]!
    if (!/^[A-Z]{3}$/.test(quote)) continue
    if (!pairByCode.has(quote)) pairByCode.set(quote, pairKey)
  }

  const codes = [...pairByCode.keys()].sort((a, b) => a.localeCompare(b))
  return {
    codes,
    krakenPairByCode: Object.fromEntries(pairByCode),
  }
}

/**
 * Intersect CoinGecko `simple/supported_vs_currencies` with ISO 4217 alpha-3.
 */
export function parseCoinGeckoSupportedVsCurrencies(
  json: unknown,
): FiatProviderCurrenciesData {
  if (!Array.isArray(json)) return EMPTY_DATA

  const codes: string[] = []
  for (const item of json) {
    if (typeof item !== 'string') continue
    const u = item.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(u) || !isIso4217Alpha3(u)) continue
    codes.push(u)
  }

  const unique = [...new Set(codes)].sort((a, b) => a.localeCompare(b))
  return { codes: unique, krakenPairByCode: {} }
}

/**
 * Use Blockchain ticker top-level keys as fiat codes, filtered by ISO 4217.
 */
export function parseBlockchainTickerKeys(json: unknown): FiatProviderCurrenciesData {
  if (typeof json !== 'object' || json === null) return EMPTY_DATA

  const codes: string[] = []
  for (const key of Object.keys(json as Record<string, unknown>)) {
    const u = key.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(u) || !isIso4217Alpha3(u)) continue
    codes.push(u)
  }

  const unique = [...new Set(codes)].sort((a, b) => a.localeCompare(b))
  return { codes: unique, krakenPairByCode: {} }
}

export function parseFiatProviderCurrenciesResponse(
  provider: FiatRateProviderId,
  json: unknown,
): FiatProviderCurrenciesData {
  switch (provider) {
    case 'kraken':
      return parseKrakenAssetPairsForBtcFiat(json)
    case 'coingecko':
      return parseCoinGeckoSupportedVsCurrencies(json)
    case 'blockchain':
      return parseBlockchainTickerKeys(json)
    default: {
      const _x: never = provider
      return _x
    }
  }
}

/**
 * Fetch + parse discovery JSON for a provider (for TanStack `queryFn` and `fetchQuery`).
 */
export async function fetchFiatProviderCurrenciesData(
  provider: FiatRateProviderId,
): Promise<FiatProviderCurrenciesData> {
  const url = buildFiatProviderCurrenciesDiscoveryUrl(provider)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Fiat currency list request failed (${res.status})`)
  }
  const json: unknown = await res.json()
  return parseFiatProviderCurrenciesResponse(provider, json)
}
