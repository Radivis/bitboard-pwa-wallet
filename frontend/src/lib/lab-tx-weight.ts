/**
 * BIP141: virtual size in vBytes = ceil(transaction weight / 4).
 * Used for fee rate (sat/vB) from stored weight alone.
 */
export function labVsizeFromWeight(weightWu: number): number {
  if (!Number.isFinite(weightWu) || weightWu <= 0) return 0
  return Math.ceil(weightWu / 4)
}
