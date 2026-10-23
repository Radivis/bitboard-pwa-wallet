import { describe, expect, it, vi } from 'vitest'
import {
  BARK_EXIT_ONCHAIN_CATCH_UP_MAX_SYNCS,
  catchUpOnchainWalletToChainTip,
  type OnchainCatchUpDeps,
} from '@/lib/bark/bark-emergency-exit-onchain-catch-up'

const ESPLORA_TIP_HEIGHT = 101

function catchUpDeps(overrides: Partial<OnchainCatchUpDeps> = {}): OnchainCatchUpDeps {
  return {
    fetchTipHeight: vi.fn(async () => ESPLORA_TIP_HEIGHT),
    syncOnchain: vi.fn(async () => undefined),
    onchainTipHeight: vi.fn(async () => ESPLORA_TIP_HEIGHT),
    ...overrides,
  }
}

/** The wallet reports each height in turn after successive syncs, then stays at the last one. */
function onchainHeightsAfterSyncs(...heights: number[]): () => Promise<number> {
  let reads = 0
  return async () => heights[Math.min(reads++, heights.length - 1)]!
}

describe('catchUpOnchainWalletToChainTip', () => {
  it('BARK-EMG-23 syncs once when the wallet reaches the observed tip', async () => {
    const deps = catchUpDeps()

    await catchUpOnchainWalletToChainTip(deps, ESPLORA_TIP_HEIGHT)

    expect(deps.syncOnchain).toHaveBeenCalledTimes(1)
    expect(deps.fetchTipHeight).not.toHaveBeenCalled()
  })

  it('BARK-EMG-23 syncs again while the wallet is still behind the observed tip', async () => {
    const deps = catchUpDeps({
      onchainTipHeight: vi.fn(onchainHeightsAfterSyncs(ESPLORA_TIP_HEIGHT - 1, ESPLORA_TIP_HEIGHT)),
    })

    await catchUpOnchainWalletToChainTip(deps, ESPLORA_TIP_HEIGHT)

    expect(deps.syncOnchain).toHaveBeenCalledTimes(2)
  })

  it('BARK-EMG-23 gives up after the sync limit when the wallet stays behind', async () => {
    const deps = catchUpDeps({
      onchainTipHeight: vi.fn(async () => ESPLORA_TIP_HEIGHT - 1),
    })

    await catchUpOnchainWalletToChainTip(deps, ESPLORA_TIP_HEIGHT)

    expect(deps.syncOnchain).toHaveBeenCalledTimes(BARK_EXIT_ONCHAIN_CATCH_UP_MAX_SYNCS)
  })

  it('BARK-EMG-23 fetches the Esplora tip when none was observed', async () => {
    const deps = catchUpDeps({
      onchainTipHeight: vi.fn(onchainHeightsAfterSyncs(ESPLORA_TIP_HEIGHT - 1, ESPLORA_TIP_HEIGHT)),
    })

    await catchUpOnchainWalletToChainTip(deps)

    expect(deps.fetchTipHeight).toHaveBeenCalledTimes(1)
    expect(deps.syncOnchain).toHaveBeenCalledTimes(2)
  })

  it('BARK-EMG-23 syncs once without a height check when the tip cannot be read', async () => {
    const deps = catchUpDeps({
      fetchTipHeight: vi.fn(async () => {
        throw new Error('esplora down')
      }),
    })

    await expect(catchUpOnchainWalletToChainTip(deps)).resolves.toBeUndefined()

    expect(deps.syncOnchain).toHaveBeenCalledTimes(1)
    expect(deps.onchainTipHeight).not.toHaveBeenCalled()
  })

  it('BARK-EMG-23 stops after one sync when the wallet height cannot be read', async () => {
    const deps = catchUpDeps({
      onchainTipHeight: vi.fn(async () => {
        throw new Error('no active wallet')
      }),
    })

    await expect(catchUpOnchainWalletToChainTip(deps, ESPLORA_TIP_HEIGHT)).resolves.toBeUndefined()

    expect(deps.syncOnchain).toHaveBeenCalledTimes(1)
  })

  it('BARK-EMG-23 stops without throwing when a sync fails', async () => {
    const deps = catchUpDeps({
      syncOnchain: vi.fn(async () => {
        throw new Error('sync failed')
      }),
    })

    await expect(catchUpOnchainWalletToChainTip(deps, ESPLORA_TIP_HEIGHT)).resolves.toBeUndefined()

    expect(deps.syncOnchain).toHaveBeenCalledTimes(1)
  })
})
