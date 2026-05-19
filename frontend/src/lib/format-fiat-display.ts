import { SATS_PER_BTC } from '@/lib/bitcoin-utils'
import type { FiatCurrencyCode } from '@/lib/supported-fiat-currencies'
import { getFiatCurrencyUiMeta } from '@/lib/supported-fiat-currencies'

function normalizeFiatCurrencyCode(currencyInput: string): FiatCurrencyCode {
  return currencyInput.trim().toUpperCase()
}

export function formatFiatFromSatsAndBtcPrice(
  amountSats: number,
  btcPriceInFiat: number,
  currencyInput: string,
): string {
  const fiatCurrencyCode = normalizeFiatCurrencyCode(currencyInput)
  const btcAmount = amountSats / SATS_PER_BTC
  const fiatAmount = btcAmount * btcPriceInFiat
  const { maxFractionDigits } = getFiatCurrencyUiMeta(fiatCurrencyCode)
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: fiatCurrencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(fiatAmount)
}

/** Placeholder for a fiat-denominated amount field (e.g. `"$0.00"`). */
export function fiatAmountInputPlaceholder(currencyInput: string): string {
  const fiatCurrencyCode = normalizeFiatCurrencyCode(currencyInput)
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: fiatCurrencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: getFiatCurrencyUiMeta(fiatCurrencyCode).maxFractionDigits,
  }).format(0)
}

/** Formats a fiat numeric value for controlled inputs (trim trailing zeros). */
export function formatFiatNumericStringForInput(
  fiatAmount: number,
  currencyInput: string,
): string {
  const fiatCurrencyCode = normalizeFiatCurrencyCode(currencyInput)
  const { maxFractionDigits } = getFiatCurrencyUiMeta(fiatCurrencyCode)
  let trimmedFixedDecimal = fiatAmount.toFixed(maxFractionDigits)
  trimmedFixedDecimal = trimmedFixedDecimal.replace(/\.?0+$/, '')
  return trimmedFixedDecimal === '' ? '0' : trimmedFixedDecimal
}

/** BIP21 / fixed-sats → fiat field string when the send UI is in fiat denomination mode. */
export function formatFiatInputStringFromSats(
  amountSats: number,
  btcPriceInFiat: number,
  currencyInput: string,
): string {
  const fiatAmount = (amountSats / SATS_PER_BTC) * btcPriceInFiat
  return formatFiatNumericStringForInput(fiatAmount, currencyInput)
}
