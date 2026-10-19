import { settleBarkEmergencyExitAfterSync } from '@/lib/bark/bark-emergency-exit-after-sync'
import { barkSyncErrorMessageWithServerNotice } from '@/lib/bark/bark-server-notice'
import { useBarkExitChainNoticeStore } from '@/lib/bark/bark-exit-seizure-notice'
import { getBarkWorker } from '@/workers/bark-factory'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import type { BarkNextRefreshObservation } from '@/lib/bark/bark-next-refresh-hint'
import type { BarkRefreshStatus } from '@/lib/bark/bark-refresh-status'
import type { BarkSyncResult } from '@/workers/bark-api'
import type { NetworkMode } from '@/stores/walletStore'
import { getBarkLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import type { SyncLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
import { createInFlightLifecycleTracker } from '@/lib/wallet/lifecycle/lifecycle-in-flight-tracker'

export type BarkSyncLifecycleSnapshot = {
  syncPhase: SyncLifecyclePhase
  networkMode: NetworkMode | null
  errorMessage: string | null
  /** Spendable sats from the last successful sync in this unlocked session. */
  spendableSats: number | null
  /** Locked sats from that same balance read. Failed syncs keep the last figure. */
  lockedSats: number | null
  /** Exiting sats from that same balance read. Failed syncs keep the last figure. */
  exitingSats: number | null
  lastSuccessfulSyncAt: string | null
  refreshStatus: BarkRefreshStatus
  /** Next refresh period from the last successful sync of this session. Failed syncs keep it. */
  nextRefresh: BarkNextRefreshObservation | null
}

export type BarkSyncParams = {
  walletId: number
  networkMode: NetworkMode
  /** When false, sync errors stay on the snapshot and do not reject. */
  throwOnError?: boolean
  /**
   * When false, skip exit progress and pending-claim reconciliation.
   * A claim uses this so a just-broadcast transaction is not treated as gone
   * before the app Esplora has indexed it.
   */
  settleExits?: boolean
}

function idleBarkSyncSnapshot(): BarkSyncLifecycleSnapshot {
  return {
    syncPhase: 'not-configured',
    networkMode: null,
    errorMessage: null,
    spendableSats: null,
    lockedSats: null,
    exitingSats: null,
    lastSuccessfulSyncAt: null,
    refreshStatus: 'idle',
    nextRefresh: null,
  }
}

function observeNextRefresh(synced: BarkSyncResult): BarkNextRefreshObservation | null {
  if (synced.nextRefresh == null) return null
  return { ...synced.nextRefresh, observedAt: synced.lastSuccessfulSyncAt }
}

let snapshot: BarkSyncLifecycleSnapshot = idleBarkSyncSnapshot()
let sessionGeneration = 0
const listeners = new Set<(next: BarkSyncLifecycleSnapshot) => void>()
const inFlightSyncTracker = createInFlightLifecycleTracker()

function notifyListeners(): void {
  const current = getBarkSyncLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
}

function setSnapshot(next: BarkSyncLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

function bumpSessionGeneration(): void {
  sessionGeneration += 1
}

export function getBarkSyncLifecycleSnapshot(): BarkSyncLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeBarkSyncLifecycle(
  listener: (next: BarkSyncLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function awaitBarkSyncQuiescence(): Promise<void> {
  await inFlightSyncTracker.awaitQuiescence()
}

/** Clears Bark sync state after the worker is gone or the rail is inactive. */
export function forceResetBarkSyncLifecycleForTeardown(): void {
  bumpSessionGeneration()
  inFlightSyncTracker.clearCurrent()
  useBarkExitChainNoticeStore.getState().hideNotice()
  setSnapshot(idleBarkSyncSnapshot())
}

/**
 * Hides the previous wallet's balance immediately.
 * In-flight sync still finishes, but a generation change stops it from publishing.
 */
export function discardShownBarkBalanceForSessionChange(): void {
  bumpSessionGeneration()
  useBarkExitChainNoticeStore.getState().hideNotice()
  setSnapshot(idleBarkSyncSnapshot())
}

/** Drops a previous wallet's Bark balance when the app locks or switches wallets. */
export function syncBarkSyncLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (
    shouldSkipRailLifecycleResetForLockPhase(
      lockPhase,
      inFlightSyncTracker.getCurrent() != null,
    )
  ) {
    return
  }
  forceResetBarkSyncLifecycleForTeardown()
}

/** Drops any spendable figure from a previous session before the new open finishes. */
export function prepareBarkSyncForSessionOpen(networkMode: NetworkMode): void {
  bumpSessionGeneration()
  inFlightSyncTracker.clearCurrent()
  useBarkExitChainNoticeStore.getState().hideNotice()
  setSnapshot({
    syncPhase: 'not-syncing',
    networkMode,
    errorMessage: null,
    spendableSats: null,
    lockedSats: null,
    exitingSats: null,
    lastSuccessfulSyncAt: null,
    refreshStatus: 'idle',
    nextRefresh: null,
  })
}

/** Shows the encrypted timestamp before this session's sync completes. Does not invent a balance. */
export function rememberBarkPersistedSyncTime(lastSuccessfulSyncAt: string | null): void {
  const current = getBarkSyncLifecycleSnapshot()
  setSnapshot({ ...current, lastSuccessfulSyncAt })
}

function syncKey(params: BarkSyncParams): string {
  return `${params.walletId}:${params.networkMode}`
}

export async function orchestrateBarkSync(params: BarkSyncParams): Promise<void> {
  const throwOnError = params.throwOnError ?? true

  if (!isBarkActiveForNetworkMode(params.networkMode)) {
    forceResetBarkSyncLifecycleForTeardown()
    if (throwOnError) {
      throw new Error('Bark is not active')
    }
    return
  }

  const loadSnapshot = getBarkLoadLifecycleSnapshot()
  if (loadSnapshot.loadPhase !== 'loaded' || loadSnapshot.networkMode !== params.networkMode) {
    if (throwOnError) {
      throw new Error('Bark session is not open')
    }
    return
  }

  const key = syncKey(params)
  const currentWork = inFlightSyncTracker.getCurrent()
  if (currentWork?.key === key) {
    if (throwOnError) {
      await currentWork.promise
    } else {
      void currentWork.promise.catch(() => {
        // The in-flight sync already recorded its snapshot.
      })
    }
    return
  }

  const generation = sessionGeneration
  await inFlightSyncTracker.begin(key, async () => {
    if (generation !== sessionGeneration) {
      return
    }
    const previous = getBarkSyncLifecycleSnapshot()
    setSnapshot({
      syncPhase: 'syncing',
      networkMode: params.networkMode,
      errorMessage: null,
      spendableSats: previous.spendableSats,
      lockedSats: previous.lockedSats,
      exitingSats: previous.exitingSats,
      lastSuccessfulSyncAt: previous.lastSuccessfulSyncAt,
      refreshStatus: previous.refreshStatus,
      nextRefresh: previous.nextRefresh,
    })
    try {
      const worker = getBarkWorker()
      const synced = await worker.sync()
      if (generation !== sessionGeneration) {
        return
      }
      useBarkExitChainNoticeStore
        .getState()
        .showNotice(params.walletId, params.networkMode, synced.exitNodeSweepVtxoItems ?? [])
      const balance = await worker.readSpendableBalance()
      if (generation !== sessionGeneration) {
        return
      }
      setSnapshot({
        syncPhase: 'not-syncing',
        networkMode: params.networkMode,
        errorMessage: null,
        spendableSats: balance.spendableSats,
        lockedSats: balance.lockedSats,
        exitingSats: balance.exitingSats,
        lastSuccessfulSyncAt: synced.lastSuccessfulSyncAt,
        refreshStatus: synced.refreshStatus ?? 'idle',
        nextRefresh: observeNextRefresh(synced),
      })
      if (generation !== sessionGeneration || params.settleExits === false) {
        return
      }
      try {
        await settleBarkEmergencyExitAfterSync(params.networkMode)
      } catch {
        // The stamp stays. The next sync tries exit progress again.
      }
    } catch (error) {
      if (generation !== sessionGeneration) {
        return
      }
      const kept = getBarkSyncLifecycleSnapshot()
      const errorMessage = await barkSyncErrorMessageWithServerNotice(params.networkMode, error)
      setSnapshot({
        syncPhase: 'sync-error',
        networkMode: params.networkMode,
        errorMessage,
        spendableSats: kept.spendableSats,
        lockedSats: kept.lockedSats,
        exitingSats: kept.exitingSats,
        lastSuccessfulSyncAt: kept.lastSuccessfulSyncAt,
        refreshStatus: kept.refreshStatus,
        nextRefresh: kept.nextRefresh,
      })
      if (throwOnError) {
        throw error
      }
    }
  })
}

/** Fire-and-forget sync after a successful open. Does not block unlock. */
export function orchestrateBarkPostLoadSync(params: {
  walletId: number
  networkMode: NetworkMode
}): void {
  void orchestrateBarkSync({
    walletId: params.walletId,
    networkMode: params.networkMode,
    throwOnError: false,
  }).catch(() => {
    // orchestrateBarkSync records the error on the snapshot when throwOnError is false.
  })
}

/** Replaces the shown spendable amount after a send that already synced. */
export function recordBarkSpendableAfterSend(result: {
  spendableSats: number
  lastSuccessfulSyncAt: string
}): void {
  const current = getBarkSyncLifecycleSnapshot()
  setSnapshot({
    syncPhase: 'not-syncing',
    networkMode: current.networkMode,
    errorMessage: null,
    spendableSats: result.spendableSats,
    lockedSats: current.lockedSats,
    exitingSats: current.exitingSats,
    lastSuccessfulSyncAt: result.lastSuccessfulSyncAt,
    refreshStatus: current.refreshStatus,
    nextRefresh: current.nextRefresh,
  })
}

/**
 * Records the post-send balance only after `send` resolves.
 * A rejection leaves the shown spendable amount unchanged.
 */
export async function commitBarkArkoorSend<T extends {
  spendableSats: number
  lastSuccessfulSyncAt: string
}>(send: () => Promise<T>): Promise<T> {
  const result = await send()
  recordBarkSpendableAfterSend(result)
  return result
}

/** @internal Test-only reset */
export function resetBarkSyncLifecycleStateForTests(): void {
  snapshot = idleBarkSyncSnapshot()
  sessionGeneration = 0
  inFlightSyncTracker.clearCurrent()
  listeners.clear()
}

/** @internal Test-only snapshot replacement */
export function replaceBarkSyncLifecycleSnapshotForTests(
  next: BarkSyncLifecycleSnapshot,
): void {
  setSnapshot(next)
}
