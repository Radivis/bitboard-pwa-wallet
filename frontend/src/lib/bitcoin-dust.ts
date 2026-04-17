import type { BitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import { formatAmountInBitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'

/** Default BTC P2WPKH-style dust floor for relay (sats). Matches common wallet UX; BDK uses script-specific thresholds. */
export const UX_DUST_FLOOR_SATS = 546

export { SATS_PER_BTC } from '@/lib/bitcoin-utils'

/** String for the send form `amount` field after dust adjustments. */
export function formatAmountInputFromSats(
  sats: number,
  unit: BitcoinDisplayUnit,
): string {
  return formatAmountInBitcoinDisplayUnit(sats, unit)
}
