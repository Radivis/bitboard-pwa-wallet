/**
 * Fiat display metadata and helpers for any ISO 4217 code used in the app.
 */

export const DEFAULT_FIAT_FALLBACK = 'USD'

/** Uppercase ISO 4217 alpha-3 codes as stored in settings. */
export type FiatCurrencyCode = string

export function isValidFiatCurrencyCodeFormat(candidate: string): boolean {
  return /^[A-Z]{3}$/.test(candidate.trim().toUpperCase())
}

export function coerceStoredFiatCurrencyCode(rawPersistedValue: unknown): FiatCurrencyCode {
  if (typeof rawPersistedValue !== 'string') return DEFAULT_FIAT_FALLBACK
  const normalizedFiatCode = rawPersistedValue.trim().toUpperCase()
  return isValidFiatCurrencyCodeFormat(normalizedFiatCode)
    ? normalizedFiatCode
    : DEFAULT_FIAT_FALLBACK
}

export function fiatCurrencyToTickerKey(fiatCurrencyCode: string): string {
  return fiatCurrencyCode.trim().toUpperCase().toLowerCase()
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

function currencySymbolFromIntl(fiatCurrencyCode: string): string {
  try {
    const numberFormatParts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: fiatCurrencyCode,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    const currencyFormatPart = numberFormatParts.find(
      (part) => part.type === 'currency',
    )
    if (currencyFormatPart?.value && currencyFormatPart.value.trim() !== '') {
      return currencyFormatPart.value
    }
  } catch {
    /* invalid or missing in ICU */
  }
  return `${fiatCurrencyCode} `
}

function currencyLabelFromIntl(fiatCurrencyCode: string): string {
  try {
    const currencyDisplayNames = new Intl.DisplayNames(undefined, { type: 'currency' })
    const localizedCurrencyName = currencyDisplayNames.of(fiatCurrencyCode)
    if (localizedCurrencyName) return localizedCurrencyName
  } catch {
    /* ignore */
  }
  return fiatCurrencyCode
}

function maxFractionDigitsFromIntl(fiatCurrencyCode: string): number {
  try {
    const resolvedMaxFractionDigits = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: fiatCurrencyCode,
    }).resolvedOptions().maximumFractionDigits
    return resolvedMaxFractionDigits ?? 2
  } catch {
    return 2
  }
}

/**
 * Display metadata for a fiat code (overrides + `Intl` fallback).
 */
export function getFiatCurrencyUiMeta(fiatCurrencyCode: string): FiatCurrencyUiMeta {
  const normalizedFiatCode = fiatCurrencyCode.trim().toUpperCase()
  const overrideMeta = FIAT_CURRENCY_UI_OVERRIDES[normalizedFiatCode]
  if (overrideMeta != null) return overrideMeta
  return {
    symbol: currencySymbolFromIntl(normalizedFiatCode),
    label: currencyLabelFromIntl(normalizedFiatCode),
    maxFractionDigits: maxFractionDigitsFromIntl(normalizedFiatCode),
  }
}
