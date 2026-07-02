import { getMatchingLightningConnectionsForDashboard } from '@/lib/lightning/lightning-connection-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { isLightningSupported } from '@/lib/lightning/lightning-utils'
import { getLightningLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'
import {
  configureLightningSaveForLoadedRail,
  orchestrateLightningSaveSnapshotPatches,
} from '@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator'
import { invalidateLightningDashboardQueries } from '@/lib/lightning/lightning-dashboard-sync'
import type { LightningRailScope } from '@/lib/wallet/lifecycle/lightning-rail-types'
import { lightningRailScopeKey } from '@/lib/wallet/lifecycle/lightning-rail-types'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import {
  awaitDifferentInFlightWork,
  createInFlightLifecycleTracker,
  getCoalescedInFlightPromise,
} from '@/lib/wallet/lifecycle/lifecycle-in-flight-tracker'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
import { withWalletWriterLock } from '@/lib/shared/opfs-writer-lock'
import type { SyncLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type {
  LightningPostLoadSyncParams,
  LightningSyncLifecycleSnapshot,
  LightningSyncThenSaveParams,
} from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-types'
import {
  LIFECYCLE_SYNC_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'

export type {
  LightningSyncKind,
  LightningSyncLifecycleSnapshot,
  LightningSyncThenSaveParams,
  LightningPostLoadSyncParams,
  ConnectionSyncTrackerStatus,
} from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-types'

type ConnectionSyncTracker = {
  inFlightCount: number
  lastStatus: 'idle' | 'ok' | 'error'
}

let snapshot: LightningSyncLifecycleSnapshot = {
  syncPhase: 'not-configured',
  railScope: null,
  errorMessage: null,
}

const connectionSyncTrackers = new Map<string, ConnectionSyncTracker>()

const listeners = new Set<(next: LightningSyncLifecycleSnapshot) => void>()
const inFlightSyncTracker = createInFlightLifecycleTracker()

function syncKey(
  params: Pick<LightningSyncThenSaveParams, 'walletId' | 'networkMode' | 'syncKind'>,
): string {
  return `${lightningRailScopeKey(params)}:${params.syncKind}`
}

function railScopeFromParams(
  params: Pick<LightningSyncThenSaveParams, 'walletId' | 'networkMode'>,
): LightningRailScope {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
  }
}

function notifyListeners(): void {
  const current = getLightningSyncLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
}

function setSnapshot(next: LightningSyncLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

function isLightningSyncRailConfigured(
  networkMode: LightningRailScope['networkMode'],
): boolean {
  const { isLightningEnabled } = useFeatureStore.getState()
  if (!isLightningEnabled || !isLightningSupported(networkMode)) {
    return false
  }
  const loadSnapshot = getLightningLoadLifecycleSnapshot()
  if (loadSnapshot.loadPhase !== 'loaded') {
    return false
  }
  return getMatchingLightningConnectionsForDashboard().length > 0
}

function recomputeAggregateSyncPhase(scope: LightningRailScope | null): SyncLifecyclePhase {
  if (scope == null || !isLightningSyncRailConfigured(scope.networkMode)) {
    return 'not-configured'
  }

  const matchingIds = new Set(
    getMatchingLightningConnectionsForDashboard().map((connection) => connection.id),
  )

  if (matchingIds.size === 0) {
    return 'not-configured'
  }

  let anySyncing = false
  let anyError = false

  for (const connectionId of matchingIds) {
    const tracker = connectionSyncTrackers.get(connectionId) ?? {
      inFlightCount: 0,
      lastStatus: 'idle' as const,
    }
    if (tracker.inFlightCount > 0) {
      anySyncing = true
    }
    if (tracker.lastStatus === 'error') {
      anyError = true
    }
  }

  if (anySyncing) {
    return 'syncing'
  }
  if (anyError) {
    return 'sync-error'
  }
  return 'not-syncing'
}

function applyAggregatePhase(scope: LightningRailScope | null, errorMessageOverride?: string | null): void {
  const syncPhase = recomputeAggregateSyncPhase(scope)
  const resolvedErrorMessage =
    errorMessageOverride !== undefined
      ? errorMessageOverride
      : syncPhase === 'sync-error'
        ? snapshot.errorMessage
        : null
  setSnapshot({ syncPhase, railScope: scope, errorMessage: resolvedErrorMessage })
}

function trackerForConnection(connectionId: string): ConnectionSyncTracker {
  const existing = connectionSyncTrackers.get(connectionId)
  if (existing != null) {
    return existing
  }
  const created: ConnectionSyncTracker = { inFlightCount: 0, lastStatus: 'idle' }
  connectionSyncTrackers.set(connectionId, created)
  return created
}

function assertCanStartLightningSync(
  params: Pick<LightningSyncThenSaveParams, 'walletId' | 'networkMode'>,
): void {
  const { isLightningEnabled } = useFeatureStore.getState()
  if (!isLightningEnabled || !isLightningSupported(params.networkMode)) {
    throw new Error('Lightning sync is not configured for this network')
  }
  if (getLightningLoadLifecycleSnapshot().loadPhase === 'loading') {
    throw new Error('Lightning sync cannot start while load is in progress')
  }
  if (getLightningLoadLifecycleSnapshot().loadPhase !== 'loaded') {
    throw new Error('Lightning sync requires loaded connections')
  }
}

export function getLightningSyncLifecycleSnapshot(): LightningSyncLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeLightningSyncLifecycle(
  listener: (next: LightningSyncLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function awaitLightningSyncQuiescence(): Promise<void> {
  await inFlightSyncTracker.awaitQuiescence()
}

export function configureLightningSyncForLoadedRail(scope: LightningRailScope): void {
  if (snapshot.syncPhase !== 'not-configured') {
    return
  }
  connectionSyncTrackers.clear()
  setSnapshot({
    syncPhase: 'not-syncing',
    railScope: scope,
    errorMessage: null,
  })
  configureLightningSaveForLoadedRail(scope)
}

export function syncLightningSyncLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (
    shouldSkipRailLifecycleResetForLockPhase(
      lockPhase,
      inFlightSyncTracker.getCurrent() != null,
    )
  ) {
    return
  }
  connectionSyncTrackers.clear()
  setSnapshot({
    syncPhase: 'not-configured',
    railScope: null,
    errorMessage: null,
  })
}

export async function runWithLightningConnectionSync<T>(
  connectionId: string,
  work: () => Promise<T>,
): Promise<T> {
  const scope = snapshot.railScope
  const tracker = trackerForConnection(connectionId)
  tracker.inFlightCount += 1
  applyAggregatePhase(scope)

  try {
    const result = await work()
    tracker.inFlightCount = Math.max(0, tracker.inFlightCount - 1)
    if (tracker.inFlightCount === 0) {
      tracker.lastStatus = 'ok'
    }
    applyAggregatePhase(scope)
    return result
  } catch (error) {
    tracker.inFlightCount = Math.max(0, tracker.inFlightCount - 1)
    if (tracker.inFlightCount === 0) {
      tracker.lastStatus = 'error'
    }
    applyAggregatePhase(scope)
    throw error
  }
}

export async function orchestrateLightningSyncThenSave(
  params: LightningSyncThenSaveParams,
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
    await withWalletWriterLock(async () => {
      assertCanStartLightningSync(params)
      const scope = railScopeFromParams(params)
      configureLightningSyncForLoadedRail(scope)

      const previousPhase = getLightningSyncLifecycleSnapshot().syncPhase
      if (previousPhase !== 'syncing') {
        applyAggregatePhase(scope)
      }

      try {
        const patches = await params.syncWork()
        applyAggregatePhase(scope)
        if (patches.length > 0) {
          try {
            await orchestrateLightningSaveSnapshotPatches({
              walletId: params.walletId,
              networkMode: params.networkMode,
              patches,
              refreshDashboardQueriesAfterSave: true,
            })
          } catch (saveError) {
            if (throwOnError) {
              throw saveError
            }
          }
        } else {
          invalidateLightningDashboardQueries()
        }
      } catch (error) {
        applyAggregatePhase(scope, userFacingLifecycleErrorMessage(error, LIFECYCLE_SYNC_ERROR_FALLBACK))
        params.onSyncError?.(error)
        if (throwOnError) {
          throw error
        }
      }
    })
  })
}

export async function orchestrateLightningPostLoadSync(
  params: LightningPostLoadSyncParams,
): Promise<void> {
  const awaitCompletion = params.awaitCompletion ?? false
  const work = orchestrateLightningSyncThenSave({
    walletId: params.walletId,
    networkMode: params.networkMode,
    syncKind: 'postLoad',
    syncWork: async () => {
      const { collectLightningDashboardSyncPatches } = await import(
        '@/lib/lightning/lightning-dashboard-sync'
      )
      return collectLightningDashboardSyncPatches()
    },
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

/** @internal Test-only reset */
export function resetLightningSyncLifecycleStateForTests(): void {
  snapshot = {
    syncPhase: 'not-configured',
    railScope: null,
    errorMessage: null,
  }
  inFlightSyncTracker.clearCurrent()
  connectionSyncTrackers.clear()
  listeners.clear()
}

/** @internal Test-only: seed connection tracker state */
export function setLightningConnectionSyncTrackerForTests(
  connectionId: string,
  tracker: ConnectionSyncTracker,
): void {
  connectionSyncTrackers.set(connectionId, tracker)
  applyAggregatePhase(snapshot.railScope)
}

/** @internal Test-only: set rail scope without full load */
export function configureLightningSyncForLoadedRailForTests(scope: LightningRailScope): void {
  configureLightningSyncForLoadedRail(scope)
}
