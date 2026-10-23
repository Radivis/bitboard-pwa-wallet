import {
  amountSatsFromFiatAndBtcPrice,
  parsePositiveFiatAmountInput,
} from '@/lib/fiat/fiat-amount-to-sats'
import { isUsableBtcSpotPriceInFiat } from '@/lib/fiat/is-usable-btc-spot-price-in-fiat'
import type { FiatCurrencyCode } from '@/lib/fiat/supported-fiat-currencies'

/** Positive whole sats. Rejects empty input, zero, fractions, and leading zeros. */
export function parsePositiveWholeSats(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^[1-9]\d*$/.test(trimmed)) return null
  const amountSats = Number(trimmed)
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) return null
  return amountSats
}

export type AmountSatsFromSatsOrFiatFieldOptions = {
  useFiatAmountEntry: boolean
  btcPriceInFiat: number | null | undefined
}

/**
 * Fiat entry converts a positive fiat amount at the spot price and keeps only
 * results of at least one sat. Otherwise the field is whole sats.
 */
export function amountSatsFromSatsOrFiatField(
  amountRaw: string,
  options: AmountSatsFromSatsOrFiatFieldOptions,
): number | null {
  if (!options.useFiatAmountEntry) {
    return parsePositiveWholeSats(amountRaw)
  }
  if (!isUsableBtcSpotPriceInFiat(options.btcPriceInFiat)) return null
  const fiatAmount = parsePositiveFiatAmountInput(amountRaw)
  if (fiatAmount == null || fiatAmount === 0) return null
  const amountSats = amountSatsFromFiatAndBtcPrice(fiatAmount, options.btcPriceInFiat)
  if (amountSats == null || amountSats < 1) return null
  return amountSats
}

function satsOrFiatAmountEntryErrorMessage(
  mainnetFiatEntry: boolean,
  currency: FiatCurrencyCode,
): string {
  return mainnetFiatEntry
    ? `Enter an amount in ${currency}.`
    : 'Enter a whole number of satoshis.'
}

export type SatsOrFiatAmountReviewDecision =
  | { kind: 'blocked' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; amountSats: number }

type SatsOrFiatAmountReviewInput = {
  mainnetFiatEntry: boolean
  hasUsableFiatSpot: boolean
  btcPriceInFiat: number | null | undefined
  currency: FiatCurrencyCode
}

/** Price missing blocks review. An unusable field is invalid. Otherwise the amount is sats. */
export function satsOrFiatAmountReviewDecision(
  amountRaw: string,
  fiat: SatsOrFiatAmountReviewInput,
): SatsOrFiatAmountReviewDecision {
  if (fiat.mainnetFiatEntry && !fiat.hasUsableFiatSpot) return { kind: 'blocked' }
  const amountSats = amountSatsFromSatsOrFiatField(amountRaw, {
    useFiatAmountEntry: fiat.mainnetFiatEntry,
    btcPriceInFiat: fiat.btcPriceInFiat,
  })
  if (amountSats == null) {
    return {
      kind: 'invalid',
      message: satsOrFiatAmountEntryErrorMessage(fiat.mainnetFiatEntry, fiat.currency),
    }
  }
  return { kind: 'ready', amountSats }
}
