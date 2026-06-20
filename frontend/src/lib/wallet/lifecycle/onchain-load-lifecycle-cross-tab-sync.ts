/**
 * Broadcasts on-chain load lifecycle snapshots across tabs so UI/E2E readiness stays aligned
 * when one tab unlocks or locks the wallet.
 */

import { isValidTabScopedBroadcastMessage } from '@/lib/shared/tab-scoped-broadcast-channel-sync'
import type { OnchainLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-types'

const CHANNEL_NAME = 'bitboard-onchain-load-lifecycle-changed'

let tabInstanceId: string | null = null

function getTabInstanceId(): string {
  if (tabInstanceId == null) {
    tabInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  }
  return tabInstanceId
}

export type OnchainLoadLifecycleBroadcastMessage = {
  sourceTabId: string
  time: number
  snapshot: OnchainLoadLifecycleSnapshot
}

function isValidOnchainLoadLifecycleBroadcastMessage(
  data: unknown,
): data is OnchainLoadLifecycleBroadcastMessage {
  if (!isValidTabScopedBroadcastMessage(data)) return false
  const record = data as Record<string, unknown>
  const remoteSnapshot = record.snapshot
  if (remoteSnapshot == null || typeof remoteSnapshot !== 'object') return false
  const snapshotRecord = remoteSnapshot as Record<string, unknown>
  const loadPhase = snapshotRecord.loadPhase
  return (
    loadPhase === 'not-configured' ||
    loadPhase === 'loading' ||
    loadPhase === 'loaded' ||
    loadPhase === 'load-error'
  )
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

/** Call after on-chain load lifecycle snapshot changes in this tab. */
export function notifyOnchainLoadLifecycleChangedFromThisTab(
  snapshot: OnchainLoadLifecycleSnapshot,
): void {
  try {
    const broadcastChannel = getPublishChannel()
    if (broadcastChannel == null) return
    const message: OnchainLoadLifecycleBroadcastMessage = {
      sourceTabId: getTabInstanceId(),
      time: Date.now(),
      snapshot,
    }
    broadcastChannel.postMessage(message)
  } catch {
    /* ignore */
  }
}

export function subscribeOnchainLoadLifecycleFromOtherTabs(
  onRemoteSnapshot: (snapshot: OnchainLoadLifecycleSnapshot) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => undefined
  }
  let broadcastChannel: BroadcastChannel
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    return () => undefined
  }

  const selfId = getTabInstanceId()

  broadcastChannel.onmessage = (ev: MessageEvent<unknown>) => {
    if (!isValidOnchainLoadLifecycleBroadcastMessage(ev.data)) return
    if (ev.data.sourceTabId === selfId) return
    onRemoteSnapshot(ev.data.snapshot)
  }

  return () => {
    broadcastChannel.close()
  }
}
