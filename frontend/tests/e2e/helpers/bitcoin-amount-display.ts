import type { Locator } from '@playwright/test'
import { parseAllSatsInTextFromFormattedBitcoinAmountDisplays } from '@/lib/bitcoin-amount-text-parse'

/**
 * E2E helpers for reading amounts the same way `BitcoinAmountDisplay` formats them, via
 * `parseAllSatsInTextFromFormattedBitcoinAmountDisplays` / re-exports below.
 * Use `satsFromFirstFormattedBitcoinDisplayInRoot` when the locator is the display root; use
 * the parse helpers for `innerText` of larger regions (e.g. balance cards, review steps).
 * Dust-floor assertions can use `textReflectsSatsInFormattedDisplaysOrLiteral` together with
 * `UX_DUST_FLOOR_SATS` from `@/lib/bitcoin-dust`.
 */

export {
  maxSatsInTextFromFormattedBitcoinAmountDisplays,
  parseAllSatsInTextFromFormattedBitcoinAmountDisplays,
  textReflectsSatsInFormattedDisplaysOrLiteral,
} from '@/lib/bitcoin-amount-text-parse'

/**
 * Root of a `BitcoinAmountDisplay` in the DOM: a `<span>` whose first child is the
 * numeric part (class `tabular-nums`), then a space, then the unit control.
 * Prefer this over scanning arbitrary containers so we parse one component at a time.
 */
export async function satsFromFirstFormattedBitcoinDisplayInRoot(
  root: Locator,
): Promise<number | null> {
  const t = (await root.innerText()).replace(/\s+/g, ' ').trim()
  const all = parseAllSatsInTextFromFormattedBitcoinAmountDisplays(t)
  if (all.length === 0) {
    return null
  }
  return all[0]!
}
