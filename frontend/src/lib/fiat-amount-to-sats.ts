import { SATS_PER_BTC } from '@/lib/bitcoin-utils'

/**
 * Parses user fiat input (ASCII digits and one `.`) into a finite non-negative number.
 */
export function parsePositiveFiatAmountInput(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  if (!/^\d*\.?\d*$/.test(t)) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/**
 * Derives satoshi amount from fiat and BTC spot price in that fiat (1 BTC = `btcPriceInFiat` units).
 * Uses round-to-nearest-integer sats.
 */
export function amountSatsFromFiatAndBtcPrice(
  fiatAmount: number,
  btcPriceInFiat: number,
): number | null {
  if (!(btcPriceInFiat > 0) || !Number.isFinite(btcPriceInFiat)) return null
  if (!Number.isFinite(fiatAmount) || fiatAmount < 0) return null
  const btc = fiatAmount / btcPriceInFiat
  const sats = Math.round(btc * SATS_PER_BTC)
  return Number.isSafeInteger(sats) ? sats : null
}
