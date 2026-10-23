/** A sync can return data from before the tip, for example when Esplora lags a block behind. */
export const BARK_EXIT_ONCHAIN_CATCH_UP_MAX_SYNCS = 3

export type OnchainCatchUpDeps = {
  fetchTipHeight: () => Promise<number>
  syncOnchain: () => Promise<void>
  /** Height of the newest block the on-chain wallet has synced. */
  onchainTipHeight: () => Promise<number>
}

async function readTipHeight(
  deps: OnchainCatchUpDeps,
  observedTipHeight: number | undefined,
): Promise<number | null> {
  if (observedTipHeight != null) return observedTipHeight
  try {
    return await deps.fetchTipHeight()
  } catch {
    return null
  }
}

async function syncedOnchain(deps: OnchainCatchUpDeps): Promise<boolean> {
  try {
    await deps.syncOnchain()
    return true
  } catch {
    return false
  }
}

/** Undefined when the wallet height cannot be read. */
async function onchainReachedTip(
  deps: OnchainCatchUpDeps,
  tipHeight: number,
): Promise<boolean | undefined> {
  try {
    return (await deps.onchainTipHeight()) >= tipHeight
  } catch {
    return undefined
  }
}

/**
 * Pay-to-Anchor children spend confirmed coins only, and the wallet sees a coin as
 * confirmed only once it has synced that block. Syncs until the wallet has reached the
 * chain tip, at most `BARK_EXIT_ONCHAIN_CATCH_UP_MAX_SYNCS` times. Never throws: a
 * wallet that stays behind leaves children waiting for funds, which is safe.
 */
export async function catchUpOnchainWalletToChainTip(
  deps: OnchainCatchUpDeps,
  observedTipHeight?: number,
): Promise<void> {
  const tipHeight = await readTipHeight(deps, observedTipHeight)
  for (let syncCount = 0; syncCount < BARK_EXIT_ONCHAIN_CATCH_UP_MAX_SYNCS; syncCount += 1) {
    if (!(await syncedOnchain(deps))) return
    if (tipHeight == null) return
    const reachedTip = await onchainReachedTip(deps, tipHeight)
    // Without a readable height another sync could not tell whether it helped.
    if (reachedTip === undefined) return
    if (reachedTip) return
  }
}
