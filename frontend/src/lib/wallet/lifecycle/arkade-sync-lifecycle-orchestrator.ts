import { toast } from 'sonner'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { refreshArkadeStoreFromLoadedWasm } from '@/lib/arkade/arkade-persistence-store-sync'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { errorMessage } from '@/lib/shared/utils'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import {
  configureArkadeSaveForLoadedRail,
  orchestrateArkadeSave,
} from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import type { ArkadeRailScope } from '@/lib/wallet/lifecycle/arkade-rail-types'
import { arkadeRailScopeKey } from '@/lib/wallet/lifecycle/arkade-rail-types'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import type {
  ArkadePostLoadSyncParams,
  ArkadeSyncLifecycleSnapshot,
  ArkadeSyncParams,
  ArkadeSyncThenSaveParams,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-types'
import type { ArkadeSaveParams } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-types'

export type {
  ArkadeSyncKind,
  ArkadeSyncLifecycleSnapshot,
  ArkadeSyncParams,
  ArkadeSyncThenSaveParams,
  ArkadePostLoadSyncParams,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-types'

const BACKGROUND_OPERATOR_SYNC_DEBOUNCE_MS = 400

type InFlightSync = {
  key: string
  promise: Promise<void>
}

let snapshot: ArkadeSyncLifecycleSnapshot = {
  syncPhase: 'not-configured',
  railScope: null,
}

let dashboardPollTimer: ReturnType<typeof setTimeout> | null = null

const listeners = new Set<(next: ArkadeSyncLifecycleSnapshot) => void>()
let inFlightSync: InFlightSync | null = null

function syncKey(
  params: Pick<ArkadeSyncParams, 'walletId' | 'networkMode' | 'connectionId' | 'syncKind'>,
): string {
  return `${arkadeRailScopeKey(params)}:${params.syncKind}`
}

function railScopeFromParams(
  params: Pick<ArkadeSyncParams, 'walletId' | 'networkMode' | 'connectionId'>,
): ArkadeRailScope {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
    connectionId: params.connectionId,
  }
}

function notifyListeners(): void {
  const current = getArkadeSyncLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
}

function setSnapshot(next: ArkadeSyncLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

function clearInFlightSync(work: InFlightSync): void {
  if (inFlightSync === work) {
    inFlightSync = null
  }
}

function beginInFlightSync(key: string, run: () => Promise<void>): Promise<void> {
  let resolveWork!: () => void
  let rejectWork!: (error: unknown) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolveWork = resolve
    rejectWork = reject
  })
  const work: InFlightSync = { key, promise }
  inFlightSync = work
  void (async () => {
    try {
      await run()
      resolveWork()
    } catch (error) {
      rejectWork(error)
    } finally {
      clearInFlightSync(work)
    }
  })()
  return promise
}

function assertCanStartArkadeSync(params: ArkadeSyncParams): void {
  if (!isArkadeActiveForNetworkMode(params.networkMode)) {
    throw new Error('Arkade sync is not configured for this network')
  }
  if (!isArkadeSupportedNetworkMode(params.networkMode)) {
    throw new Error('Arkade sync is not supported on this network')
  }
  if (getArkadeLoadLifecycleSnapshot().loadPhase === 'loading') {
    throw new Error('Arkade sync cannot start while load is in progress')
  }
  if (getArkadeLoadLifecycleSnapshot().loadPhase !== 'loaded') {
    throw new Error('Arkade sync requires loaded WASM session')
  }
}

function toSaveParams(params: ArkadeSyncParams): ArkadeSaveParams {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
    connectionId: params.connectionId,
  }
}

async function runArkadeOperatorSyncBody(connectionId: string): Promise<void> {
  const worker = getArkadeWorker()
  await worker.syncWithOperator()
  await refreshArkadeStoreFromLoadedWasm(connectionId)
}

export function getArkadeSyncLifecycleSnapshot(): ArkadeSyncLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeArkadeSyncLifecycle(
  listener: (next: ArkadeSyncLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function awaitArkadeSyncQuiescence(): Promise<void> {
  if (dashboardPollTimer != null) {
    clearTimeout(dashboardPollTimer)
    dashboardPollTimer = null
  }
  if (inFlightSync != null) {
    await inFlightSync.promise.catch(() => undefined)
  }
}

/** Clears sync lifecycle after session teardown (see {@link closeArkadeSession}). */
export function forceResetArkadeSyncLifecycleForTeardown(): void {
  if (dashboardPollTimer != null) {
    clearTimeout(dashboardPollTimer)
    dashboardPollTimer = null
  }
  inFlightSync = null
  setSnapshot({
    syncPhase: 'not-configured',
    railScope: null,
  })
}

export function configureArkadeSyncForLoadedRail(scope: ArkadeRailScope): void {
  if (snapshot.syncPhase !== 'not-configured') {
    return
  }
  setSnapshot({
    syncPhase: 'not-syncing',
    railScope: scope,
  })
  configureArkadeSaveForLoadedRail(scope)
}

export function syncArkadeSyncLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (lockPhase === 'unlocking' || lockPhase === 'unlocked') {
    return
  }
  if (inFlightSync != null) {
    return
  }
  if (dashboardPollTimer != null) {
    clearTimeout(dashboardPollTimer)
    dashboardPollTimer = null
  }
  setSnapshot({
    syncPhase: 'not-configured',
    railScope: null,
  })
}

export async function orchestrateArkadeSyncThenSave(
  params: ArkadeSyncThenSaveParams,
): Promise<void> {
  const throwOnError = params.throwOnError ?? params.awaitCompletion !== false
  const key = syncKey(params)

  if (inFlightSync?.key === key) {
    return inFlightSync.promise
  }

  if (inFlightSync != null) {
    await inFlightSync.promise
    if (inFlightSync?.key === key) {
      return inFlightSync.promise
    }
  }

  return beginInFlightSync(key, async () => {
    assertCanStartArkadeSync(params)
    const scope = railScopeFromParams(params)
    configureArkadeSyncForLoadedRail(scope)

    setSnapshot({ syncPhase: 'syncing', railScope: scope })

    try {
      await runArkadeOperatorSyncBody(params.connectionId)
      setSnapshot({ syncPhase: 'not-syncing', railScope: scope })
      try {
        await orchestrateArkadeSave(toSaveParams(params))
      } catch (saveError) {
        if (throwOnError) {
          throw saveError
        }
      }
    } catch (error) {
      setSnapshot({ syncPhase: 'sync-error', railScope: scope })
      params.onSyncError?.(error)
      toast.error(`Arkade operator sync failed: ${errorMessage(error)}`)
      if (throwOnError) {
        throw error
      }
    }
  })
}

export async function orchestrateArkadePostLoadSync(
  params: ArkadePostLoadSyncParams,
): Promise<void> {
  const awaitCompletion = params.awaitCompletion ?? false
  const work = orchestrateArkadeSyncThenSave({
    walletId: params.walletId,
    networkMode: params.networkMode,
    connectionId: params.connectionId,
    syncKind: 'postLoad',
    onSyncError: params.onSyncError,
    awaitCompletion,
    throwOnError: awaitCompletion,
  })
  if (awaitCompletion) {
    await work
  } else {
    void work
  }
}

export function scheduleBackgroundArkadeOperatorSync(): void {
  if (dashboardPollTimer != null) {
    clearTimeout(dashboardPollTimer)
  }

  dashboardPollTimer = setTimeout(() => {
    dashboardPollTimer = null

    const walletState = useWalletStore.getState()
    const networkMode = getCommittedNetworkMode()
    if (
      walletState.activeWalletId == null ||
      walletState.activeArkadeConnectionId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return
    }

    if (inFlightSync != null) {
      scheduleBackgroundArkadeOperatorSync()
      return
    }

    void orchestrateArkadeSyncThenSave({
      walletId: walletState.activeWalletId,
      networkMode,
      connectionId: walletState.activeArkadeConnectionId,
      syncKind: 'dashboardPoll',
      awaitCompletion: false,
      throwOnError: false,
    })
  }, BACKGROUND_OPERATOR_SYNC_DEBOUNCE_MS)
}

/** @internal Test-only reset */
export function resetArkadeSyncLifecycleStateForTests(): void {
  snapshot = {
    syncPhase: 'not-configured',
    railScope: null,
  }
  inFlightSync = null
  if (dashboardPollTimer != null) {
    clearTimeout(dashboardPollTimer)
    dashboardPollTimer = null
  }
  listeners.clear()
}
