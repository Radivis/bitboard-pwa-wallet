import { getBarkWorker } from '@/workers/bark-factory'
import { isBarkActiveForNetworkMode } from '@/lib/bark/bark-utils'
import type { NetworkMode } from '@/stores/walletStore'
import { getBarkLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'
import type { SyncLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import { createInFlightLifecycleTracker } from '@/lib/wallet/lifecycle/lifecycle-in-flight-tracker'
import {
  LIFECYCLE_SYNC_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'

export type BarkSyncLifecycleSnapshot = {
  syncPhase: SyncLifecyclePhase
  networkMode: NetworkMode | null
  errorMessage: string | null
  /** Spendable sats from the last successful sync in this unlocked session. */
  spendableSats: number | null
  lastSuccessfulSyncAt: string | null
}

export type BarkSyncParams = {
  walletId: number
  networkMode: NetworkMode
  /** When false, sync errors stay on the snapshot and do not reject. */
  throwOnError?: boolean
}

function idleBarkSyncSnapshot(): BarkSyncLifecycleSnapshot {
  return {
    syncPhase: 'not-configured',
    networkMode: null,
    errorMessage: null,
    spendableSats: null,
    lastSuccessfulSyncAt: null,
  }
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
  setSnapshot(idleBarkSyncSnapshot())
}

/** Drops any spendable figure from a previous session before the new open finishes. */
export function prepareBarkSyncForSessionOpen(networkMode: NetworkMode): void {
  bumpSessionGeneration()
  inFlightSyncTracker.clearCurrent()
  setSnapshot({
    syncPhase: 'not-syncing',
    networkMode,
    errorMessage: null,
    spendableSats: null,
    lastSuccessfulSyncAt: null,
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
      lastSuccessfulSyncAt: previous.lastSuccessfulSyncAt,
    })
    try {
      const worker = getBarkWorker()
      const synced = await worker.sync()
      const spendableSats = await worker.readSpendableBalance()
      if (generation !== sessionGeneration) {
        return
      }
      setSnapshot({
        syncPhase: 'not-syncing',
        networkMode: params.networkMode,
        errorMessage: null,
        spendableSats,
        lastSuccessfulSyncAt: synced.lastSuccessfulSyncAt,
      })
    } catch (error) {
      if (generation !== sessionGeneration) {
        return
      }
      const kept = getBarkSyncLifecycleSnapshot()
      setSnapshot({
        syncPhase: 'sync-error',
        networkMode: params.networkMode,
        errorMessage: userFacingLifecycleErrorMessage(error, LIFECYCLE_SYNC_ERROR_FALLBACK),
        spendableSats: kept.spendableSats,
        lastSuccessfulSyncAt: kept.lastSuccessfulSyncAt,
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
