export type OnchainLoadHydration = {
  fullScanDone: boolean
  usedEmptyChainFallback: boolean
}

/** LIFE-ONC-SYNC-02: unlock full-scans only when no prior full scan or empty-chain fallback. */
export function onchainPostUnlockNeedsFullScan(input: OnchainLoadHydration): boolean {
  return !input.fullScanDone || input.usedEmptyChainFallback
}
