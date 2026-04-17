/**
 * TanStack Query caches wallet-related data per browser tab. After another tab writes to the
 * main SQLite DB (wallets, settings, etc.), this channel notifies peers so they invalidate and
 * refetch — same idea as `lab-cross-tab-sync.ts` for the lab DB.
 */

import {
  createTabScopedBroadcastChannelSync,
  type TabScopedBroadcastMessage,
} from '@/lib/tab-scoped-broadcast-channel-sync'

const walletChannel = createTabScopedBroadcastChannelSync(
  'bitboard-wallet-db-changed',
)

/** Call after wallet-related DB changes in this tab (typically paired with query invalidation). */
export function notifyWalletDataMayHaveChangedAfterCommit(): void {
  walletChannel.notify()
}

export type WalletDataChangedMessage = TabScopedBroadcastMessage

export function subscribeWalletDataChangedFromOtherTabs(
  onRemoteChange: () => void,
): () => void {
  return walletChannel.subscribe(onRemoteChange)
}
