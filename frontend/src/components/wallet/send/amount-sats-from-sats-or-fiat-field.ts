import {
  amountSatsFromFiatAndBtcPrice,
  parsePositiveFiatAmountInput,
} from '@/lib/fiat/fiat-amount-to-sats'
import { isUsableBtcSpotPriceInFiat } from '@/lib/fiat/is-usable-btc-spot-price-in-fiat'
import { parseBarkBoardAmountSats } from '@/lib/bark/review-bark-board'

export type AmountSatsFromSatsOrFiatFieldOptions = {
  useFiatAmountEntry: boolean
  btcPriceInFiat: number | null | undefined
}

/**
 * Bark board and offboard amounts. Fiat entry converts a positive fiat amount at the
 * spot price and keeps only results of at least one sat. Otherwise the field is whole sats.
 */
export function amountSatsFromSatsOrFiatField(
  amountRaw: string,
  options: AmountSatsFromSatsOrFiatFieldOptions,
): number | null {
  if (!options.useFiatAmountEntry) {
    return parseBarkBoardAmountSats(amountRaw)
  }
  if (!isUsableBtcSpotPriceInFiat(options.btcPriceInFiat)) return null
  const fiatAmount = parsePositiveFiatAmountInput(amountRaw)
  if (fiatAmount == null || fiatAmount === 0) return null
  const amountSats = amountSatsFromFiatAndBtcPrice(fiatAmount, options.btcPriceInFiat)
  if (amountSats == null || amountSats < 1) return null
  return amountSats
}
