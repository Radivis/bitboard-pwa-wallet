/**
 * When multiple tabs share the same origin, each has its own TanStack Query cache for lab
 * chain state (`staleTime: Infinity`). After another tab persists lab state to SQLite, this
 * channel notifies other tabs so they invalidate and reload from the DB — keeping UI in sync
 * with {@link initLabWorkerWithState} / {@link loadLabStateFromDatabase}.
 */

import {
  createTabScopedBroadcastChannelSync,
  type TabScopedBroadcastMessage,
} from '@/lib/tab-scoped-broadcast-channel-sync'

const labChannel = createTabScopedBroadcastChannelSync(
  'bitboard-lab-state-persisted',
)

/** Call after lab SQLite has committed successfully (e.g. end of {@link persistLabState}). */
export function notifyLabStatePersistedAfterCommit(): void {
  labChannel.notify()
}

export type LabStatePersistedMessage = TabScopedBroadcastMessage

/** Subscribes to persists from *other* tabs (same message from this tab is ignored). */
export function subscribeLabStatePersistedFromOtherTabs(
  onRemotePersist: () => void,
): () => void {
  return labChannel.subscribe(onRemotePersist)
}
