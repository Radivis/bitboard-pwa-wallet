/**
 * True when we have a finite positive BTC spot price in the user's fiat (from rate APIs).
 * Prefer this over ad-hoc `!= null && > 0` checks so UI and send/receive logic agree with
 * {@link amountSatsFromFiatAndBtcPrice} (which also requires a finite positive price).
 */
export function isUsableBtcSpotPriceInFiat(
  btcPriceInFiat: number | null | undefined,
): btcPriceInFiat is number {
  return (
    btcPriceInFiat != null &&
    Number.isFinite(btcPriceInFiat) &&
    btcPriceInFiat > 0
  )
}
