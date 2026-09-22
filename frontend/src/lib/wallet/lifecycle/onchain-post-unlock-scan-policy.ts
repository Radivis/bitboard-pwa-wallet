export type OnchainLoadHydration = {
  fullScanDone: boolean
  usedEmptyChainFallback: boolean
}

/**
 * LIFE-ONC-SYNC-02 / SE-01: unlock full-scans when there is no prior full scan,
 * empty-chain fallback was used, or load hydration is missing (fail-closed).
 */
export function onchainPostUnlockNeedsFullScan(
  input: OnchainLoadHydration | null,
): boolean {
  if (input == null) {
    return true
  }
  return !input.fullScanDone || input.usedEmptyChainFallback
}
