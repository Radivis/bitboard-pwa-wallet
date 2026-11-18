import type { BitcoinDisplayUnit } from '@/lib/wallet/bitcoin-display-unit'

/** Positive whole sats. Rejects empty input, zero, fractions, and leading zeros. */
export function parsePositiveWholeSats(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^[1-9]\d*$/.test(trimmed)) return null
  const amountSats = Number(trimmed)
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) return null
  return amountSats
}
import { isUsableBtcSpotPriceInFiat } from '@/lib/fiat/is-usable-btc-spot-price-in-fiat'
import type { FiatCurrencyCode } from '@/lib/fiat/supported-fiat-currencies'
import {
  parseUniversalAmount,
  universalAmountEntryLabel,
  type UniversalAmountEntry,
} from '@/lib/wallet/universal-amount'

export type AmountSatsFromSatsOrFiatFieldOptions = {
  useFiatAmountEntry: boolean
  btcPriceInFiat: number | null | undefined
  /** Bitcoin-mode unit. Defaults to sat. Ignored while fiat entry is on. */
  bitcoinUnit?: BitcoinDisplayUnit
}

/**
 * Fiat entry converts a positive fiat amount at the spot price and keeps only
 * results of at least one sat. Otherwise the field uses the Bitcoin display unit.
 */
export function amountSatsFromSatsOrFiatField(
  amountRaw: string,
  options: AmountSatsFromSatsOrFiatFieldOptions,
): number | null {
  const parsedAmount = parseUniversalAmount(amountRaw, universalEntryFromFieldOptions(options))
  if (parsedAmount.kind !== 'sats' || parsedAmount.amountSats < 1) return null
  return parsedAmount.amountSats
}

function universalEntryFromFieldOptions(
  options: AmountSatsFromSatsOrFiatFieldOptions,
  currency: FiatCurrencyCode = 'USD',
): UniversalAmountEntry {
  if (!options.useFiatAmountEntry) {
    return { mode: 'bitcoin', bitcoinUnit: options.bitcoinUnit ?? 'sat' }
  }
  return {
    mode: 'fiat',
    currency,
    btcPriceInFiat: options.btcPriceInFiat,
    hasUsableFiatSpot: isUsableBtcSpotPriceInFiat(options.btcPriceInFiat),
    rateLoading: false,
  }
}

function satsOrFiatAmountEntryErrorMessage(entry: UniversalAmountEntry): string {
  if (entry.mode === 'bitcoin' && entry.bitcoinUnit === 'sat') {
    return 'Enter a whole number of satoshis.'
  }
  return `Enter an amount in ${universalAmountEntryLabel(entry)}.`
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
  bitcoinUnit?: BitcoinDisplayUnit
}

/** Price missing blocks review. An unusable field is invalid. Otherwise the amount is sats. */
export function satsOrFiatAmountReviewDecision(
  amountRaw: string,
  fiat: SatsOrFiatAmountReviewInput,
): SatsOrFiatAmountReviewDecision {
  const fieldOptions: AmountSatsFromSatsOrFiatFieldOptions = {
    useFiatAmountEntry: fiat.mainnetFiatEntry,
    btcPriceInFiat: fiat.btcPriceInFiat,
    bitcoinUnit: fiat.bitcoinUnit,
  }
  if (fiat.mainnetFiatEntry && !fiat.hasUsableFiatSpot) return { kind: 'blocked' }
  const amountSats = amountSatsFromSatsOrFiatField(amountRaw, fieldOptions)
  if (amountSats == null) {
    return {
      kind: 'invalid',
      message: satsOrFiatAmountEntryErrorMessage(
        universalEntryFromFieldOptions(fieldOptions, fiat.currency),
      ),
    }
  }
  return { kind: 'ready', amountSats }
}
