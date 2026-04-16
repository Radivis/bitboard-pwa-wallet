/**
 * TanStack Query caches wallet-related data per browser tab. After another tab writes to the
 * main SQLite DB (wallets, settings, etc.), this channel notifies peers so they invalidate and
 * refetch — same idea as `lab-cross-tab-sync.ts` for the lab DB.
 */

const CHANNEL_NAME = 'bitboard-wallet-db-changed'

let tabInstanceId: string | null = null

function getTabInstanceId(): string {
  if (tabInstanceId == null) {
    tabInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  }
  return tabInstanceId
}

let publishChannel: BroadcastChannel | null = null

function getPublishChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (publishChannel == null) {
    try {
      publishChannel = new BroadcastChannel(CHANNEL_NAME)
    } catch {
      return null
    }
  }
  return publishChannel
}

/** Call after wallet-related DB changes in this tab (typically paired with query invalidation). */
export function notifyWalletDataMayHaveChangedAfterCommit(): void {
  try {
    const ch = getPublishChannel()
    if (ch == null) return
    ch.postMessage({ sourceTabId: getTabInstanceId(), t: Date.now() })
  } catch {
    /* ignore */
  }
}

export type WalletDataChangedMessage = { sourceTabId: string; t: number }

export function subscribeWalletDataChangedFromOtherTabs(
  onRemoteChange: () => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => undefined
  }
  let ch: BroadcastChannel
  try {
    ch = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    return () => undefined
  }
  const selfId = getTabInstanceId()
  ch.onmessage = (ev: MessageEvent<WalletDataChangedMessage>) => {
    const id = ev.data?.sourceTabId
    if (id === selfId) return
    onRemoteChange()
  }
  return () => {
    ch.close()
  }
}
