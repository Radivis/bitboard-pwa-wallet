/** Base label when the user leaves the NWC connection label empty. */
export const DEFAULT_NWC_CONNECTION_LABEL_BASE = 'My NWC connected wallet'

function escapeRegExpChars(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * True when `trimmedLabel` equals the auto-generated base or a numbered slot
 * (`My NWC connected wallet(1)`, …) produced by {@link resolveDefaultNwcConnectionLabel}.
 * Expects a **trimmed** string; callers should trim user input first.
 */
export function isReservedDefaultNwcConnectionLabel(trimmedLabel: string): boolean {
  if (trimmedLabel === DEFAULT_NWC_CONNECTION_LABEL_BASE) {
    return true
  }
  const escapedBase = escapeRegExpChars(DEFAULT_NWC_CONNECTION_LABEL_BASE)
  const numberedPattern = new RegExp(`^${escapedBase}\\((\\d+)\\)$`)
  return numberedPattern.test(trimmedLabel)
}

/**
 * Picks a unique default label among existing connection labels for the same wallet.
 * Uses `My NWC connected wallet`, then `My NWC connected wallet(1)`, `(2)`, … as needed.
 */
export function resolveDefaultNwcConnectionLabel(
  existingLabels: readonly string[],
): string {
  const labels = new Set(existingLabels)
  if (!labels.has(DEFAULT_NWC_CONNECTION_LABEL_BASE)) {
    return DEFAULT_NWC_CONNECTION_LABEL_BASE
  }
  let n = 1
  for (;;) {
    const candidate = `${DEFAULT_NWC_CONNECTION_LABEL_BASE}(${n})`
    if (!labels.has(candidate)) return candidate
    n += 1
  }
}
