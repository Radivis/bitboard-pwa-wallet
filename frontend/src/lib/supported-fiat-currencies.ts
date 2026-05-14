/**
 * Fiat display metadata and helpers for any ISO 4217 code used in the app.
 */

export const DEFAULT_FIAT_FALLBACK = 'USD'

/** Uppercase ISO 4217 alpha-3 codes as stored in settings. */
export type FiatCurrencyCode = string

export function isValidFiatCurrencyCodeFormat(v: string): boolean {
  return /^[A-Z]{3}$/.test(v.trim().toUpperCase())
}

export function coerceStoredFiatCurrencyCode(v: unknown): FiatCurrencyCode {
  if (typeof v !== 'string') return DEFAULT_FIAT_FALLBACK
  const t = v.trim().toUpperCase()
  return isValidFiatCurrencyCodeFormat(t) ? t : DEFAULT_FIAT_FALLBACK
}

export function fiatCurrencyToTickerKey(c: string): string {
  return c.trim().toUpperCase().toLowerCase()
}

export type FiatCurrencyUiMeta = {
  /** Symbol next to the denomination toggle when not using Intl-derived narrow symbol */
  symbol: string
  label: string
  maxFractionDigits: number
}

/** Curated overrides where `Intl` is often wrong or too verbose for UI chrome. */
const FIAT_CURRENCY_UI_OVERRIDES: Partial<
  Record<string, FiatCurrencyUiMeta>
> = {
  USD: { symbol: '$', label: 'US Dollar', maxFractionDigits: 2 },
  EUR: { symbol: '€', label: 'Euro', maxFractionDigits: 2 },
  GBP: { symbol: '£', label: 'British Pound', maxFractionDigits: 2 },
  JPY: { symbol: '¥', label: 'Japanese Yen', maxFractionDigits: 0 },
  CHF: { symbol: 'Fr', label: 'Swiss Franc', maxFractionDigits: 2 },
  CAD: { symbol: 'C$', label: 'Canadian Dollar', maxFractionDigits: 2 },
  AUD: { symbol: 'A$', label: 'Australian Dollar', maxFractionDigits: 2 },
  CNY: { symbol: '¥', label: 'Chinese Yuan', maxFractionDigits: 2 },
  INR: { symbol: '₹', label: 'Indian Rupee', maxFractionDigits: 2 },
  KRW: { symbol: '₩', label: 'South Korean Won', maxFractionDigits: 0 },
  BRL: { symbol: 'R$', label: 'Brazilian Real', maxFractionDigits: 2 },
}

function currencySymbolFromIntl(code: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    const cur = parts.find((p) => p.type === 'currency')
    if (cur?.value && cur.value.trim() !== '') return cur.value
  } catch {
    /* invalid or missing in ICU */
  }
  return `${code} `
}

function currencyLabelFromIntl(code: string): string {
  try {
    const dn = new Intl.DisplayNames(undefined, { type: 'currency' })
    const n = dn.of(code)
    if (n) return n
  } catch {
    /* ignore */
  }
  return code
}

function maxFractionDigitsFromIntl(code: string): number {
  try {
    const n = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).resolvedOptions().maximumFractionDigits
    return n ?? 2
  } catch {
    return 2
  }
}

/**
 * Display metadata for a fiat code (overrides + `Intl` fallback).
 */
export function getFiatCurrencyUiMeta(code: string): FiatCurrencyUiMeta {
  const upper = code.trim().toUpperCase()
  const o = FIAT_CURRENCY_UI_OVERRIDES[upper]
  if (o != null) return o
  return {
    symbol: currencySymbolFromIntl(upper),
    label: currencyLabelFromIntl(upper),
    maxFractionDigits: maxFractionDigitsFromIntl(upper),
  }
}
