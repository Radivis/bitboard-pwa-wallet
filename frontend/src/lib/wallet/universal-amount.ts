import {
  BITCOIN_DISPLAY_UNIT_LABEL,
  formatAmountInBitcoinDisplayUnit,
  parseAmountToSatsFromBitcoinDisplayUnit,
  type BitcoinDisplayUnit,
} from '@/lib/wallet/bitcoin-display-unit'
import { satsFromNonNegativeDecimalAmount } from '@/lib/wallet/bitcoin-utils'
import {
  amountSatsFromFiatAndBtcPrice,
  parsePositiveFiatAmountInput,
} from '@/lib/fiat/fiat-amount-to-sats'
import { formatFiatInputStringFromSats } from '@/lib/fiat/format-fiat-display'
import type { FiatCurrencyCode } from '@/lib/fiat/supported-fiat-currencies'
import { useMainnetFiatAmountProps } from '@/hooks/useMainnetFiatAmountProps'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'

const BITCOIN_UNIT_FRACTION_DIGITS: Record<Exclude<BitcoinDisplayUnit, 'sat'>, number> = {
  BTC: 8,
  mBTC: 5,
  uBTC: 2,
  ksat: 3,
}

export type UniversalAmountFiatEntry = {
  mode: 'fiat'
  currency: FiatCurrencyCode
  btcPriceInFiat: number | null | undefined
  hasUsableFiatSpot: boolean
  rateLoading: boolean
}

export type UniversalAmountBitcoinEntry = {
  mode: 'bitcoin'
  bitcoinUnit: BitcoinDisplayUnit
}

export type UniversalAmountEntry = UniversalAmountFiatEntry | UniversalAmountBitcoinEntry

export type UniversalAmountParse =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'sats'; amountSats: number }

export type UniversalAmountEntryOptions = {
  allowFetchWhenPortfolioZeroForReceivePage?: boolean
}

/** Active unit label: a fiat code, or the Bitcoin display label such as sat or BTC. */
export function universalAmountEntryLabel(entry: UniversalAmountEntry): string {
  if (entry.mode === 'fiat') return entry.currency
  return BITCOIN_DISPLAY_UNIT_LABEL[entry.bitcoinUnit]
}

/**
 * Fiat mode on mainnet wins over a Bitcoin unit override. Otherwise the override
 * wins over the Settings unit.
 */
export function resolveUniversalAmountEntry(context: {
  mainnetFiatEntry: boolean
  currency: FiatCurrencyCode
  btcPriceInFiat: number | null | undefined
  hasUsableFiatSpot: boolean
  rateLoading: boolean
  defaultBitcoinUnit: BitcoinDisplayUnit
  bitcoinUnitOverride?: BitcoinDisplayUnit
}): UniversalAmountEntry {
  if (context.mainnetFiatEntry) {
    return {
      mode: 'fiat',
      currency: context.currency,
      btcPriceInFiat: context.btcPriceInFiat,
      hasUsableFiatSpot: context.hasUsableFiatSpot,
      rateLoading: context.rateLoading,
    }
  }
  return {
    mode: 'bitcoin',
    bitcoinUnit: context.bitcoinUnitOverride ?? context.defaultBitcoinUnit,
  }
}

/** Settings unit, or `bitcoinUnit` when fiat denomination mode does not apply. */
export function useUniversalAmountEntry(
  bitcoinUnit?: BitcoinDisplayUnit,
  options?: UniversalAmountEntryOptions,
): UniversalAmountEntry {
  const fiatAmount = useMainnetFiatAmountProps(options)
  const defaultBitcoinUnit = useBitcoinDisplayUnitStore(
    (bitcoinDisplayUnitState) => bitcoinDisplayUnitState.defaultBitcoinUnit,
  )
  return resolveUniversalAmountEntry({
    mainnetFiatEntry: fiatAmount.mainnetFiatEntry,
    currency: fiatAmount.currency,
    btcPriceInFiat: fiatAmount.btcPriceInFiat,
    hasUsableFiatSpot: fiatAmount.hasUsableFiatSpot,
    rateLoading: fiatAmount.rateLoading,
    defaultBitcoinUnit,
    bitcoinUnitOverride: bitcoinUnit,
  })
}

/**
 * Satoshi value of an amount string in the active entry unit.
 * Empty and unparsable text stay distinct. Satoshis reject fractions and leading zeros.
 * Other Bitcoin units use {@link parseAmountToSatsFromBitcoinDisplayUnit}.
 */
export function parseUniversalAmount(
  amountRaw: string,
  entry: UniversalAmountEntry,
): UniversalAmountParse {
  const trimmedAmount = amountRaw.trim()
  if (trimmedAmount === '') return { kind: 'empty' }
  if (entry.mode === 'fiat') return parseFiatAmount(trimmedAmount, entry)
  if (entry.bitcoinUnit === 'sat') return parseWholeSatAmount(trimmedAmount)
  return parseDecimalBitcoinAmount(trimmedAmount, entry.bitcoinUnit)
}

/** Rewrites a satoshi amount into the text the active unit's field should show. */
export function formatUniversalAmountFromSats(
  amountSats: number,
  entry: UniversalAmountEntry,
): string {
  if (entry.mode === 'bitcoin') {
    return formatAmountInBitcoinDisplayUnit(amountSats, entry.bitcoinUnit)
  }
  if (!entry.hasUsableFiatSpot || entry.btcPriceInFiat == null) return String(amountSats)
  return formatFiatInputStringFromSats(amountSats, entry.btcPriceInFiat, entry.currency)
}

function parseFiatAmount(
  trimmedAmount: string,
  entry: UniversalAmountFiatEntry,
): UniversalAmountParse {
  const fiatAmount = parsePositiveFiatAmountInput(trimmedAmount)
  if (fiatAmount == null) return { kind: 'invalid' }
  if (!entry.hasUsableFiatSpot || entry.btcPriceInFiat == null) return { kind: 'invalid' }
  const amountSats = amountSatsFromFiatAndBtcPrice(fiatAmount, entry.btcPriceInFiat)
  if (amountSats == null) return { kind: 'invalid' }
  return { kind: 'sats', amountSats }
}

function parseWholeSatAmount(trimmedAmount: string): UniversalAmountParse {
  const withoutCommas = trimmedAmount.replace(/,/g, '')
  const isSingleZero = withoutCommas === '0'
  const isPositiveWholeSat = /^[1-9]\d*$/.test(withoutCommas)
  if (!isSingleZero && !isPositiveWholeSat) return { kind: 'invalid' }
  return {
    kind: 'sats',
    amountSats: parseAmountToSatsFromBitcoinDisplayUnit(trimmedAmount, 'sat'),
  }
}

function parseDecimalBitcoinAmount(
  trimmedAmount: string,
  bitcoinUnit: Exclude<BitcoinDisplayUnit, 'sat'>,
): UniversalAmountParse {
  const parsedSats = satsFromNonNegativeDecimalAmount(
    trimmedAmount,
    BITCOIN_UNIT_FRACTION_DIGITS[bitcoinUnit],
  )
  if (parsedSats == null) return { kind: 'invalid' }
  return {
    kind: 'sats',
    amountSats: parseAmountToSatsFromBitcoinDisplayUnit(trimmedAmount, bitcoinUnit),
  }
}
