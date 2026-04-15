/** Default BTC P2WPKH-style dust floor for relay (sats). Matches common wallet UX; BDK uses script-specific thresholds. */
export const UX_DUST_FLOOR_SATS = 546

/** Satoshis per 1 BTC (consensus). */
export const SATS_PER_BTC = 100_000_000

/** String for the send form `amount` field after dust adjustments. */
export function formatAmountInputFromSats(
  sats: number,
  unit: 'btc' | 'sats',
): string {
  if (unit === 'sats') {
    return String(Math.floor(sats))
  }
  return (sats / SATS_PER_BTC).toFixed(8)
}
