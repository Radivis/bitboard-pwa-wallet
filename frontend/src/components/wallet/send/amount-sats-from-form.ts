import type { SendAmountUnit } from '@/stores/sendStore'
import { parseAmountToSatsFromBitcoinDisplayUnit } from '@/lib/wallet/bitcoin-display-unit'
import { isUsableBtcSpotPriceInFiat } from '@/lib/fiat/is-usable-btc-spot-price-in-fiat'
import type { FiatCurrencyCode } from '@/lib/fiat/supported-fiat-currencies'
import { parseUniversalAmount } from '@/lib/wallet/universal-amount'

export function amountSatsFromForm(
  amountStr: string,
  unit: SendAmountUnit,
): number {
  return parseAmountToSatsFromBitcoinDisplayUnit(amountStr, unit)
}

export type AmountSatsFromSendFormOptions = {
  useFiatAmountEntry: boolean
  btcPriceInFiat: number | null | undefined
  /** Selected fiat currency. Used when fiat entry is on. */
  currency: FiatCurrencyCode
}

/**
 * Send form: mainnet fiat denomination uses the fiat spot conversion;
 * otherwise the Send amount unit. Empty and invalid text are 0 sats.
 */
export function amountSatsFromSendForm(
  amountStr: string,
  unit: SendAmountUnit,
  sendFormAmountOptions: AmountSatsFromSendFormOptions,
): number {
  const parsedAmount = parseUniversalAmount(
    amountStr,
    sendFormAmountOptions.useFiatAmountEntry
      ? {
          mode: 'fiat',
          currency: sendFormAmountOptions.currency,
          btcPriceInFiat: sendFormAmountOptions.btcPriceInFiat,
          hasUsableFiatSpot: isUsableBtcSpotPriceInFiat(sendFormAmountOptions.btcPriceInFiat),
          rateLoading: false,
        }
      : { mode: 'bitcoin', bitcoinUnit: unit },
  )
  return parsedAmount.kind === 'sats' ? parsedAmount.amountSats : 0
}
