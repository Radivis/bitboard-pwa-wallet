/**
 * Broadcasts on-chain rail lifecycle snapshots across tabs when the same descriptor
 * wallet is loaded in WASM in both tabs.
 */

import { isValidTabScopedBroadcastMessage } from '@/lib/shared/tab-scoped-broadcast-channel-sync'
import type { OnchainRailDescriptorScope } from '@/lib/wallet/lifecycle/onchain-rail-types'
import {
  getLocalOnchainRailDescriptorScope,
  getOnchainRailSnapshot,
  localDescriptorScopeMatchesRemote,
} from '@/lib/wallet/lifecycle/onchain-rail-snapshot'
import { applyOnchainLoadLifecycleSnapshotFromOtherTab } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import { applyOnchainSyncLifecycleSnapshotFromRemote } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { applyOnchainSaveLifecycleSnapshotFromRemote } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import { getOnchainLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import { getOnchainSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { getOnchainSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import type { OnchainLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-types'
import type { OnchainSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-types'
import type { OnchainSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'
import type { OnchainRailSnapshot } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

const CHANNEL_NAME = 'bitboard-onchain-rail-lifecycle-changed'

let tabInstanceId: string | null = null

function getTabInstanceId(): string {
  if (tabInstanceId == null) {
    tabInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  }
  return tabInstanceId
}

export type OnchainRailLifecycleBroadcastMessage = {
  sourceTabId: string
  time: number
  descriptorScope: OnchainRailDescriptorScope
  loadSnapshot: OnchainLoadLifecycleSnapshot
  syncSnapshot: OnchainSyncLifecycleSnapshot
  saveSnapshot: OnchainSaveLifecycleSnapshot
  railSnapshot: OnchainRailSnapshot
}

function isValidOnchainRailLifecycleBroadcastMessage(
  data: unknown,
): data is OnchainRailLifecycleBroadcastMessage {
  if (!isValidTabScopedBroadcastMessage(data)) return false
  const record = data as Record<string, unknown>
  if (record.descriptorScope == null || typeof record.descriptorScope !== 'object') {
    return false
  }
  if (record.loadSnapshot == null || typeof record.loadSnapshot !== 'object') {
    return false
  }
  if (record.syncSnapshot == null || typeof record.syncSnapshot !== 'object') {
    return false
  }
  if (record.saveSnapshot == null || typeof record.saveSnapshot !== 'object') {
    return false
  }
  return true
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

export function notifyOnchainRailLifecycleChangedFromThisTab(): void {
  const descriptorScope = getLocalOnchainRailDescriptorScope()
  if (descriptorScope == null) {
    return
  }

  try {
    const broadcastChannel = getPublishChannel()
    if (broadcastChannel == null) return

    const message: OnchainRailLifecycleBroadcastMessage = {
      sourceTabId: getTabInstanceId(),
      time: Date.now(),
      descriptorScope,
      loadSnapshot: getOnchainLoadLifecycleSnapshot(),
      syncSnapshot: getOnchainSyncLifecycleSnapshot(),
      saveSnapshot: getOnchainSaveLifecycleSnapshot(),
      railSnapshot: getOnchainRailSnapshot(),
    }
    broadcastChannel.postMessage(message)
  } catch {
    /* ignore */
  }
}

export function applyOnchainRailSnapshotFromOtherTab(
  message: OnchainRailLifecycleBroadcastMessage,
): void {
  if (!localDescriptorScopeMatchesRemote(message.descriptorScope)) {
    return
  }
  applyOnchainLoadLifecycleSnapshotFromOtherTab(message.loadSnapshot)
  applyOnchainSyncLifecycleSnapshotFromRemote(message.syncSnapshot)
  applyOnchainSaveLifecycleSnapshotFromRemote(message.saveSnapshot)
}

export function subscribeOnchainRailLifecycleFromOtherTabs(
  onRemote: (message: OnchainRailLifecycleBroadcastMessage) => void,
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
    if (!isValidOnchainRailLifecycleBroadcastMessage(ev.data)) return
    if (ev.data.sourceTabId === selfId) return
    onRemote(ev.data)
  }

  return () => {
    broadcastChannel.close()
  }
}
