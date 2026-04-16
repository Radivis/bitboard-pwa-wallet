/**
 * When multiple tabs share the same origin, each has its own TanStack Query cache for lab
 * chain state (`staleTime: Infinity`). After another tab persists lab state to SQLite, this
 * channel notifies other tabs so they invalidate and reload from the DB — keeping UI in sync
 * with {@link initLabWorkerWithState} / {@link loadLabStateFromDatabase}.
 */

const CHANNEL_NAME = 'bitboard-lab-state-persisted'

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

/** Call after lab SQLite has committed successfully (e.g. end of {@link persistLabState}). */
export function notifyLabStatePersistedAfterCommit(): void {
  try {
    const ch = getPublishChannel()
    if (ch == null) return
    ch.postMessage({ sourceTabId: getTabInstanceId(), t: Date.now() })
  } catch {
    /* ignore */
  }
}

export type LabStatePersistedMessage = { sourceTabId: string; t: number }

/** Subscribes to persists from *other* tabs (same message from this tab is ignored). */
export function subscribeLabStatePersistedFromOtherTabs(
  onRemotePersist: () => void,
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
  ch.onmessage = (ev: MessageEvent<LabStatePersistedMessage>) => {
    const id = ev.data?.sourceTabId
    if (id === selfId) return
    onRemotePersist()
  }
  return () => {
    ch.close()
  }
}
