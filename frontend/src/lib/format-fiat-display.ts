import { SATS_PER_BTC } from '@/lib/bitcoin-utils'
import type { SupportedDefaultFiatCurrency } from '@/lib/supported-fiat-currencies'
import { FIAT_CURRENCY_UI } from '@/lib/supported-fiat-currencies'

export function formatFiatFromSatsAndBtcPrice(
  amountSats: number,
  btcPriceInFiat: number,
  currency: SupportedDefaultFiatCurrency,
): string {
  const btc = amountSats / SATS_PER_BTC
  const fiat = btc * btcPriceInFiat
  const { maxFractionDigits } = FIAT_CURRENCY_UI[currency]
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(fiat)
}

/** Placeholder for a fiat-denominated amount field (e.g. `"$0.00"`). */
export function fiatAmountInputPlaceholder(
  currency: SupportedDefaultFiatCurrency,
): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: FIAT_CURRENCY_UI[currency].maxFractionDigits,
  }).format(0)
}

/** Formats a fiat numeric value for controlled inputs (trim trailing zeros). */
export function formatFiatNumericStringForInput(
  fiatAmount: number,
  currency: SupportedDefaultFiatCurrency,
): string {
  const { maxFractionDigits } = FIAT_CURRENCY_UI[currency]
  let s = fiatAmount.toFixed(maxFractionDigits)
  s = s.replace(/\.?0+$/, '')
  return s === '' ? '0' : s
}

/** BIP21 / fixed-sats → fiat field string when the send UI is in fiat denomination mode. */
export function formatFiatInputStringFromSats(
  amountSats: number,
  btcPriceInFiat: number,
  currency: SupportedDefaultFiatCurrency,
): string {
  const fiat = (amountSats / SATS_PER_BTC) * btcPriceInFiat
  return formatFiatNumericStringForInput(fiat, currency)
}
