/**
 * One {@link BroadcastChannel} per logical channel name, plus a single tab id for this
 * browser tab (shared across all channels) so self-posted messages are ignored.
 */

let tabInstanceId: string | null = null

function getTabInstanceId(): string {
  if (tabInstanceId == null) {
    tabInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  }
  return tabInstanceId
}

export type TabScopedBroadcastMessage = { sourceTabId: string; time: number }

/**
 * Rejects malformed payloads so same-origin scripts cannot spam invalidations with `{}`.
 * @internal Exported for unit tests.
 */
export function isValidTabScopedBroadcastMessage(
  data: unknown,
): data is TabScopedBroadcastMessage {
  if (data == null || typeof data !== 'object') return false
  const messageRecord = data as Record<string, unknown>
  const sourceTabId = messageRecord.sourceTabId
  const time = messageRecord.time
  if (typeof sourceTabId !== 'string' || sourceTabId.trim() === '') return false
  if (typeof time !== 'number' || !Number.isFinite(time)) return false
  return true
}

function createPublishChannel(channelName: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  try {
    return new BroadcastChannel(channelName)
  } catch {
    return null
  }
}

/**
 * Returns notify/subscribe for a named channel. Each `channelName` gets its own lazy
 * publisher instance; `sourceTabId` is shared across all channels in this tab.
 */
export function createTabScopedBroadcastChannelSync(channelName: string) {
  let publishChannel: BroadcastChannel | null = null

  function getPublishChannel(): BroadcastChannel | null {
    if (publishChannel == null) {
      publishChannel = createPublishChannel(channelName)
    }
    return publishChannel
  }

  function notify(): void {
    try {
      const broadcastChannel = getPublishChannel()
      if (broadcastChannel == null) return
      const msg: TabScopedBroadcastMessage = {
        sourceTabId: getTabInstanceId(),
        time: Date.now(),
      }
      broadcastChannel.postMessage(msg)
    } catch {
      /* ignore */
    }
  }

  function subscribe(onRemote: () => void): () => void {
    if (typeof BroadcastChannel === 'undefined') {
      return () => undefined
    }
    let broadcastChannel: BroadcastChannel
    try {
      broadcastChannel = new BroadcastChannel(channelName)
    } catch {
      return () => undefined
    }
    const selfId = getTabInstanceId()
    broadcastChannel.onmessage = (ev: MessageEvent<unknown>) => {
      if (!isValidTabScopedBroadcastMessage(ev.data)) return
      if (ev.data.sourceTabId === selfId) return
      onRemote()
    }
    return () => {
      broadcastChannel.close()
    }
  }

  return { notify, subscribe }
}
