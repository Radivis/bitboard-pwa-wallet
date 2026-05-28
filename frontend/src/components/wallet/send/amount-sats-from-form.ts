import type { SendAmountUnit } from '@/stores/sendStore'
import { parseAmountToSatsFromBitcoinDisplayUnit } from '@/lib/wallet/bitcoin-display-unit'
import {
  amountSatsFromFiatAndBtcPrice,
  parsePositiveFiatAmountInput,
} from '@/lib/fiat/fiat-amount-to-sats'
import { isUsableBtcSpotPriceInFiat } from '@/lib/fiat/is-usable-btc-spot-price-in-fiat'

export function amountSatsFromForm(
  amountStr: string,
  unit: SendAmountUnit,
): number {
  return parseAmountToSatsFromBitcoinDisplayUnit(amountStr, unit)
}

export type AmountSatsFromSendFormOptions = {
  useFiatAmountEntry: boolean
  btcPriceInFiat: number | null | undefined
}

/**
 * Send form: mainnet fiat denomination uses {@link parsePositiveFiatAmountInput} + spot price;
 * otherwise Bitcoin display units.
 */
export function amountSatsFromSendForm(
  amountStr: string,
  unit: SendAmountUnit,
  sendFormAmountOptions: AmountSatsFromSendFormOptions,
): number {
  if (
    sendFormAmountOptions.useFiatAmountEntry &&
    isUsableBtcSpotPriceInFiat(sendFormAmountOptions.btcPriceInFiat)
  ) {
    const fiatAmount = parsePositiveFiatAmountInput(amountStr)
    if (fiatAmount == null) return 0
    return (
      amountSatsFromFiatAndBtcPrice(
        fiatAmount,
        sendFormAmountOptions.btcPriceInFiat,
      ) ?? 0
    )
  }
  return amountSatsFromForm(amountStr, unit)
}
