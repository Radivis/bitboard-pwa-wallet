/**
 * Allowlisted FX API bases for `/api/fiat-rates/{providerId}/...`.
 * Only the listed path prefixes may be proxied (see api/fiat-rates handler).
 */
export type FiatRateProviderId = 'kraken' | 'coingecko' | 'blockchain'

export const FIAT_RATE_PROVIDER_LABELS: Record<FiatRateProviderId, string> = {
  kraken: 'Kraken',
  coingecko: 'CoinGecko',
  blockchain: 'Blockchain.com',
}

export const FIAT_RATE_PROVIDER_IDS = [
  'kraken',
  'coingecko',
  'blockchain',
] as const satisfies readonly FiatRateProviderId[]

export const FIAT_RATE_PROVIDER_BASES: Record<FiatRateProviderId, string> = {
  kraken: 'https://api.kraken.com',
  coingecko: 'https://api.coingecko.com',
  blockchain: 'https://blockchain.info',
}

/** Path prefixes (no trailing slash) allowed after origin for each provider. */
export const FIAT_RATE_PROVIDER_PATH_PREFIXES: Record<
  FiatRateProviderId,
  readonly string[]
> = {
  kraken: ['/0/public/Ticker'],
  coingecko: ['/api/v3/simple/price'],
  blockchain: ['/ticker'],
}

export const FIAT_SAME_ORIGIN_PROXY_PREFIX = /** @see api/fiat-rates */ '/api/fiat-rates'

export function isKnownFiatRateProviderId(id: string): id is FiatRateProviderId {
  return id === 'kraken' || id === 'coingecko' || id === 'blockchain'
}

export function getUpstreamBaseForFiatRateProxy(
  providerId: string,
): string | null {
  if (!isKnownFiatRateProviderId(providerId)) return null
  return FIAT_RATE_PROVIDER_BASES[providerId] ?? null
}

/**
 * Returns true if `pathname` (absolute path only, e.g. `/0/public/Ticker`) is allowed for provider.
 */
export function isFiatRatePathAllowedForProvider(
  providerId: FiatRateProviderId,
  pathname: string,
): boolean {
  const normalized = pathname.replace(/\/$/, '') || '/'
  return FIAT_RATE_PROVIDER_PATH_PREFIXES[providerId].some((prefix) => {
    const p = prefix.replace(/\/$/, '') || '/'
    return normalized === p || normalized.startsWith(`${p}/`)
  })
}

export type FiatRateViteProxyEntry = {
  localPrefix: string
  targetOrigin: string
  upstreamPathPrefix: string
}

export function fiatRateViteProxyEntries(): FiatRateViteProxyEntry[] {
  return (Object.keys(FIAT_RATE_PROVIDER_BASES) as FiatRateProviderId[]).map(
    (providerId) => {
      const baseUrl = FIAT_RATE_PROVIDER_BASES[providerId]
      const u = new URL(baseUrl)
      return {
        localPrefix: `${FIAT_SAME_ORIGIN_PROXY_PREFIX}/${providerId}`,
        targetOrigin: `${u.protocol}//${u.host}`,
        upstreamPathPrefix: '',
      }
    },
  )
}
