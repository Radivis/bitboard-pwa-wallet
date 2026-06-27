import { getArkadeWorker } from '@/workers/arkade-factory'
import { refreshArkadeStoreFromLoadedWasm } from '@/lib/arkade/arkade-persistence-store-sync'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import {
  configureArkadeSaveForLoadedRail,
  orchestrateArkadeSave,
} from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import type { ArkadeRailScope } from '@/lib/wallet/lifecycle/arkade-rail-types'
import { arkadeRailScopeKey } from '@/lib/wallet/lifecycle/arkade-rail-types'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import {
  awaitDifferentInFlightWork,
  createInFlightLifecycleTracker,
  getCoalescedInFlightPromise,
} from '@/lib/wallet/lifecycle/lifecycle-in-flight-tracker'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
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

let snapshot: ArkadeSyncLifecycleSnapshot = {
  syncPhase: 'not-configured',
  railScope: null,
}

let dashboardPollTimer: ReturnType<typeof setTimeout> | null = null

const listeners = new Set<(next: ArkadeSyncLifecycleSnapshot) => void>()
const inFlightSyncTracker = createInFlightLifecycleTracker()

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

async function runArkadeSignerMigrationBody(): Promise<void> {
  const worker = getArkadeWorker()
  await worker.migrateDeprecatedSignerVtxos()
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
  await inFlightSyncTracker.awaitQuiescence({ swallowError: true })
}

/** Clears sync lifecycle after session teardown (see {@link closeArkadeSession}). */
export function forceResetArkadeSyncLifecycleForTeardown(): void {
  if (dashboardPollTimer != null) {
    clearTimeout(dashboardPollTimer)
    dashboardPollTimer = null
  }
  inFlightSyncTracker.clearCurrent()
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
  if (
    shouldSkipRailLifecycleResetForLockPhase(
      lockPhase,
      inFlightSyncTracker.getCurrent() != null,
    )
  ) {
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

  const coalesced = getCoalescedInFlightPromise(inFlightSyncTracker, key)
  if (coalesced != null) {
    return coalesced
  }
  const afterDifferentWork = await awaitDifferentInFlightWork(inFlightSyncTracker, key)
  if (afterDifferentWork != null) {
    return afterDifferentWork
  }

  return inFlightSyncTracker.begin(key, async () => {
    assertCanStartArkadeSync(params)
    const scope = railScopeFromParams(params)
    configureArkadeSyncForLoadedRail(scope)

    setSnapshot({ syncPhase: 'syncing', railScope: scope })

    try {
      if (params.syncKind === 'signerMigration') {
        await runArkadeSignerMigrationBody()
      }
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

    if (inFlightSyncTracker.getCurrent() != null) {
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
  inFlightSyncTracker.clearCurrent()
  if (dashboardPollTimer != null) {
    clearTimeout(dashboardPollTimer)
    dashboardPollTimer = null
  }
  listeners.clear()
}
