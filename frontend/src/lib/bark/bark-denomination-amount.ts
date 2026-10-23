import { amountSatsFromSatsOrFiatField } from '@/components/wallet/send/amount-sats-from-sats-or-fiat-field'
import type { MainnetFiatAmountDisplayProps } from '@/hooks/useMainnetFiatAmountProps'
import type { FiatCurrencyCode } from '@/lib/fiat/supported-fiat-currencies'

export function barkAmountEntryErrorMessage(
  mainnetFiatEntry: boolean,
  currency: FiatCurrencyCode,
): string {
  return mainnetFiatEntry
    ? `Enter an amount in ${currency}.`
    : 'Enter a whole number of satoshis.'
}

export type BarkAmountReviewDecision =
  | { kind: 'blocked' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; amountSats: number }

/** Price missing blocks review. An unusable field is invalid. Otherwise the amount is sats. */
export function barkAmountReviewDecision(
  amountRaw: string,
  fiat: MainnetFiatAmountDisplayProps & {
    mainnetFiatEntry: boolean
    hasUsableFiatSpot: boolean
  },
): BarkAmountReviewDecision {
  if (fiat.mainnetFiatEntry && !fiat.hasUsableFiatSpot) return { kind: 'blocked' }
  const amountSats = amountSatsFromSatsOrFiatField(amountRaw, {
    useFiatAmountEntry: fiat.mainnetFiatEntry,
    btcPriceInFiat: fiat.btcPriceInFiat,
  })
  if (amountSats == null) {
    return {
      kind: 'invalid',
      message: barkAmountEntryErrorMessage(fiat.mainnetFiatEntry, fiat.currency),
    }
  }
  return { kind: 'ready', amountSats }
}
