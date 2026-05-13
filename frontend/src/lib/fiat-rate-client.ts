import type { FiatRateProviderId } from '@/lib/fiat-rate-service-whitelist'
import { FIAT_SAME_ORIGIN_PROXY_PREFIX } from '@/lib/fiat-rate-service-whitelist'
import type { SupportedDefaultFiatCurrency } from '@/lib/supported-fiat-currencies'
import { fiatCurrencyToTickerKey } from '@/lib/supported-fiat-currencies'

/** Kraken `pair` query values for XBT/Fiat (documented asset pairs). */
const KRAKEN_XBT_PAIR: Record<SupportedDefaultFiatCurrency, string> = {
  USD: 'XXBTZUSD',
  EUR: 'XXBTZEUR',
  GBP: 'XXBTZGBP',
}

export function buildMainnetFiatRateRequestUrl(
  provider: FiatRateProviderId,
  currency: SupportedDefaultFiatCurrency,
): string {
  const origin =
    typeof globalThis.location !== 'undefined'
      ? globalThis.location.origin
      : ''
  const base = `${origin}${FIAT_SAME_ORIGIN_PROXY_PREFIX}/${provider}`
  const key = fiatCurrencyToTickerKey(currency)
  switch (provider) {
    case 'kraken': {
      const pair = KRAKEN_XBT_PAIR[currency]
      return `${base}/0/public/Ticker?pair=${encodeURIComponent(pair)}`
    }
    case 'coingecko':
      return `${base}/api/v3/simple/price?ids=bitcoin&vs_currencies=${encodeURIComponent(key)}`
    case 'blockchain':
      return `${base}/ticker`
    default: {
      const _exhaustive: never = provider
      return _exhaustive
    }
  }
}

export type ParsedBtcPriceInFiat = {
  btcPriceInFiat: number
}

export function parseFiatRateProviderResponse(
  provider: FiatRateProviderId,
  currency: SupportedDefaultFiatCurrency,
  json: unknown,
): ParsedBtcPriceInFiat | null {
  const key = fiatCurrencyToTickerKey(currency)
  switch (provider) {
    case 'coingecko': {
      if (
        typeof json !== 'object' ||
        json === null ||
        !('bitcoin' in json) ||
        typeof (json as { bitcoin: unknown }).bitcoin !== 'object' ||
        (json as { bitcoin: object }).bitcoin === null
      ) {
        return null
      }
      const row = (json as { bitcoin: Record<string, unknown> }).bitcoin
      const v = row[key]
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
      return Number.isFinite(n) && n > 0 ? { btcPriceInFiat: n } : null
    }
    case 'blockchain': {
      if (typeof json !== 'object' || json === null) return null
      const row = (json as Record<string, { last?: unknown }>)[currency]
      if (row == null || typeof row !== 'object') return null
      const last = row.last
      const n =
        typeof last === 'number' ? last : typeof last === 'string' ? Number(last) : NaN
      return Number.isFinite(n) && n > 0 ? { btcPriceInFiat: n } : null
    }
    case 'kraken': {
      if (
        typeof json !== 'object' ||
        json === null ||
        !('result' in json) ||
        typeof (json as { result: unknown }).result !== 'object' ||
        (json as { result: object }).result === null
      ) {
        return null
      }
      const result = (json as { result: Record<string, unknown> }).result
      const keys = Object.keys(result)
      if (keys.length === 0) return null
      const first = result[keys[0]!]
      if (typeof first !== 'object' || first === null || !('c' in first))
        return null
      const c = (first as { c: unknown }).c
      if (!Array.isArray(c) || c.length < 1) return null
      const lastStr = c[0]
      const n =
        typeof lastStr === 'string'
          ? Number(lastStr)
          : typeof lastStr === 'number'
            ? lastStr
            : NaN
      return Number.isFinite(n) && n > 0 ? { btcPriceInFiat: n } : null
    }
    default: {
      const _exhaustive: never = provider
      return _exhaustive
    }
  }
}
