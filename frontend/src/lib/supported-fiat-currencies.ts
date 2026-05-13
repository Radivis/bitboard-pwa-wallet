/**
 * Fiat codes every implemented rate provider (Kraken, CoinGecko, blockchain.info ticker)
 * can resolve for BTC in this app. Keep in sync with parsers and proxy allowlists.
 */
export const SUPPORTED_DEFAULT_FIAT_CURRENCIES = ['USD', 'EUR', 'GBP'] as const

export type SupportedDefaultFiatCurrency =
  (typeof SUPPORTED_DEFAULT_FIAT_CURRENCIES)[number]

export function isSupportedDefaultFiatCurrency(
  v: string,
): v is SupportedDefaultFiatCurrency {
  return (SUPPORTED_DEFAULT_FIAT_CURRENCIES as readonly string[]).includes(v)
}

/** Lowercase for CoinGecko `vs_currencies` / blockchain.info keys. */
export function fiatCurrencyToTickerKey(
  c: SupportedDefaultFiatCurrency,
): string {
  return c.toLowerCase()
}

export type FiatCurrencyUiMeta = {
  /** Symbol next to the denomination toggle (not Intl-derived). */
  symbol: string
  label: string
  maxFractionDigits: number
}

export const FIAT_CURRENCY_UI: Record<
  SupportedDefaultFiatCurrency,
  FiatCurrencyUiMeta
> = {
  USD: { symbol: '$', label: 'US Dollar', maxFractionDigits: 2 },
  EUR: { symbol: '€', label: 'Euro', maxFractionDigits: 2 },
  GBP: { symbol: '£', label: 'British Pound', maxFractionDigits: 2 },
}
