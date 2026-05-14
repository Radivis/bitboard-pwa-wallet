import { SATS_PER_BTC } from '@/lib/bitcoin-utils'
import type { FiatCurrencyCode } from '@/lib/supported-fiat-currencies'
import { getFiatCurrencyUiMeta } from '@/lib/supported-fiat-currencies'

function fiatCode(currency: string): FiatCurrencyCode {
  return currency.trim().toUpperCase()
}

export function formatFiatFromSatsAndBtcPrice(
  amountSats: number,
  btcPriceInFiat: number,
  currency: string,
): string {
  const code = fiatCode(currency)
  const btc = amountSats / SATS_PER_BTC
  const fiat = btc * btcPriceInFiat
  const { maxFractionDigits } = getFiatCurrencyUiMeta(code)
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(fiat)
}

/** Placeholder for a fiat-denominated amount field (e.g. `"$0.00"`). */
export function fiatAmountInputPlaceholder(currency: string): string {
  const code = fiatCode(currency)
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: getFiatCurrencyUiMeta(code).maxFractionDigits,
  }).format(0)
}

/** Formats a fiat numeric value for controlled inputs (trim trailing zeros). */
export function formatFiatNumericStringForInput(
  fiatAmount: number,
  currency: string,
): string {
  const code = fiatCode(currency)
  const { maxFractionDigits } = getFiatCurrencyUiMeta(code)
  let s = fiatAmount.toFixed(maxFractionDigits)
  s = s.replace(/\.?0+$/, '')
  return s === '' ? '0' : s
}

/** BIP21 / fixed-sats → fiat field string when the send UI is in fiat denomination mode. */
export function formatFiatInputStringFromSats(
  amountSats: number,
  btcPriceInFiat: number,
  currency: string,
): string {
  const fiat = (amountSats / SATS_PER_BTC) * btcPriceInFiat
  return formatFiatNumericStringForInput(fiat, currency)
}
