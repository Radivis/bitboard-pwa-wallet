import { describe, expect, it } from 'vitest'
import { onchainPostUnlockNeedsFullScan } from '@/lib/wallet/lifecycle/onchain-post-unlock-scan-policy'

describe('onchainPostUnlockNeedsFullScan LIFE-ONC-SYNC-02', () => {
  it('is false when fullScanDone and no empty-chain fallback', () => {
    expect(
      onchainPostUnlockNeedsFullScan({
        fullScanDone: true,
        usedEmptyChainFallback: false,
      }),
    ).toBe(false)
  })

  it('is true when fullScanDone is false', () => {
    expect(
      onchainPostUnlockNeedsFullScan({
        fullScanDone: false,
        usedEmptyChainFallback: false,
      }),
    ).toBe(true)
  })

  it('is true when empty-chain fallback was used', () => {
    expect(
      onchainPostUnlockNeedsFullScan({
        fullScanDone: true,
        usedEmptyChainFallback: true,
      }),
    ).toBe(true)
  })
})
