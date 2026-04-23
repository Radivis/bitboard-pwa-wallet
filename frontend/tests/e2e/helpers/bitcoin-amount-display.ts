import type { Locator } from '@playwright/test'
import { parseAllSatsInTextFromFormattedBitcoinAmountDisplays } from '@/lib/bitcoin-amount-text-parse'

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
