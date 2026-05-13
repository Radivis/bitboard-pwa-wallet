import type { SendAmountUnit } from '@/stores/sendStore'
import { parseAmountToSatsFromBitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import {
  amountSatsFromFiatAndBtcPrice,
  parsePositiveFiatAmountInput,
} from '@/lib/fiat-amount-to-sats'
import { isUsableBtcSpotPriceInFiat } from '@/lib/is-usable-btc-spot-price-in-fiat'

export function amountSatsFromForm(
  amountStr: string,
  unit: SendAmountUnit,
): number {
  return parseAmountToSatsFromBitcoinDisplayUnit(amountStr, unit)
}

/**
 * Send form: mainnet fiat denomination uses {@link parsePositiveFiatAmountInput} + spot price;
 * otherwise Bitcoin display units.
 */
export function amountSatsFromSendForm(
  amountStr: string,
  unit: SendAmountUnit,
  opts: {
    useFiatAmountEntry: boolean
    btcPriceInFiat: number | null | undefined
  },
): number {
  if (opts.useFiatAmountEntry && isUsableBtcSpotPriceInFiat(opts.btcPriceInFiat)) {
    const fiat = parsePositiveFiatAmountInput(amountStr)
    if (fiat == null) return 0
    return amountSatsFromFiatAndBtcPrice(fiat, opts.btcPriceInFiat) ?? 0
  }
  return amountSatsFromForm(amountStr, unit)
}
