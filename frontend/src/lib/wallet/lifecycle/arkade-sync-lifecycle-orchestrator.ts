import { proxy } from 'comlink'
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
import { withWalletWriterLock } from '@/lib/shared/opfs-writer-lock'
import {
  ARKADE_BACKGROUND_OPERATOR_SYNC_DEBOUNCE_MS,
  ARKADE_BACKGROUND_OPERATOR_SYNC_MIN_INTERVAL_MS,
} from '@/lib/arkade/arkade-sync-timings'
import type {
  ArkadePostLoadSyncParams,
  ArkadeSyncLifecycleSnapshot,
  ArkadeSyncParams,
  ArkadeSyncKind,
  ArkadeSyncThenSaveParams,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-types'
import type { ArkadeSaveParams } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-types'
import {
  operatorSyncSchedulesBackgroundFull,
  shouldScheduleBackgroundFullVtxoReconcile,
  shouldScheduleBackgroundKeyDiscovery,
} from '@/lib/arkade/arkade-operator-sync-policy'
import type {
  ArkadeOperatorSyncResult,
  ArkadePendingBatchIntent,
  ArkadeSignerMigrationResult,
  BackgroundFullVtxoReconcileOutcome,
} from '@/workers/arkade-api'
import {
  arkadeOperatorConfigDiffQueryKey,
  arkadeOperatorTrustStatusQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import {
  LIFECYCLE_SYNC_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'

export type {
  ArkadeSyncKind,
  ArkadeSyncLifecycleSnapshot,
  ArkadeSyncParams,
  ArkadeSyncThenSaveParams,
  ArkadePostLoadSyncParams,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-types'

let snapshot: ArkadeSyncLifecycleSnapshot = {
  syncPhase: 'not-configured',
  railScope: null,
  errorMessage: null,
  warningMessages: [],
}

let dashboardPollTimer: ReturnType<typeof setTimeout> | null = null
let dashboardPollQueuedWhileSyncing = false
let lastDashboardPollStartedAtMs = 0

const listeners = new Set<(next: ArkadeSyncLifecycleSnapshot) => void>()
const inFlightSyncTracker = createInFlightLifecycleTracker()
/** Coalesced signer-migration callers share one in-flight promise; attach result to that promise. */
const signerMigrationResultByInFlightPromise = new WeakMap<
  Promise<void>,
  ArkadeSignerMigrationResult
>()

function syncKey(
  params: Pick<ArkadeSyncParams, 'walletId' | 'networkMode' | 'arkadeAccountId' | 'syncKind'>,
): string {
  return `${arkadeRailScopeKey(params)}:${params.syncKind}`
}

function railScopeFromParams(
  params: Pick<ArkadeSyncParams, 'walletId' | 'networkMode' | 'arkadeAccountId'>,
): ArkadeRailScope {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
    arkadeAccountId: params.arkadeAccountId,
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
    arkadeAccountId: params.arkadeAccountId,
  }
}

async function runArkadeSignerMigrationBody(
  onIntentRegistered?: (intent: ArkadePendingBatchIntent) => void,
): Promise<ArkadeSignerMigrationResult> {
  const worker = getArkadeWorker()
  return worker.migrateDeprecatedSignerVtxos(onIntentRegistered)
}

type ArkadeSyncWarningSlots = {
  keyDiscovery: string | null
  exitingVtxo: string | null
  backgroundReconcile: string | null
}

function emptyWarningSlots(): ArkadeSyncWarningSlots {
  return {
    keyDiscovery: null,
    exitingVtxo: null,
    backgroundReconcile: null,
  }
}

function nonEmptyWarning(message: string | null | undefined): string | null {
  if (message == null || message === '') {
    return null
  }
  return message
}

let warningSlots: ArkadeSyncWarningSlots = emptyWarningSlots()

function activeWarningMessages(): string[] {
  return [
    warningSlots.keyDiscovery,
    warningSlots.exitingVtxo,
    warningSlots.backgroundReconcile,
  ].filter((message): message is string => message != null)
}

function applySuccessfulArkadeSyncSnapshot(
  scope: ArkadeRailScope,
  syncResult: ArkadeOperatorSyncResult,
): void {
  const keyDiscoveryWarning = nonEmptyWarning(syncResult.keyDiscoveryWarning)
  if (keyDiscoveryWarning != null) {
    warningSlots.keyDiscovery = keyDiscoveryWarning
  } else if (syncResult.skippedKeyDiscovery !== true) {
    warningSlots.keyDiscovery = null
  }
  warningSlots.exitingVtxo = nonEmptyWarning(syncResult.exitingVtxoWarning)
  setSnapshot({
    syncPhase: 'not-syncing',
    railScope: scope,
    errorMessage: null,
    warningMessages: activeWarningMessages(),
  })
}

async function invalidateOperatorTrustQueriesForScope(scope: ArkadeRailScope): Promise<void> {
  if (!isArkadeSupportedNetworkMode(scope.networkMode)) {
    return
  }
  const { appQueryClient } = await import('@/lib/shared/app-query-client')
  await appQueryClient.invalidateQueries({
    queryKey: arkadeOperatorTrustStatusQueryKey(
      scope.walletId,
      scope.networkMode,
      scope.arkadeAccountId,
    ),
  })
  await appQueryClient.invalidateQueries({
    queryKey: arkadeOperatorConfigDiffQueryKey(
      scope.walletId,
      scope.networkMode,
      scope.arkadeAccountId,
    ),
  })
}

let backgroundKeyDiscoveryScheduledThisSession = false

function publishWarningSlots(): void {
  const current = getArkadeSyncLifecycleSnapshot()
  setSnapshot({
    ...current,
    warningMessages: activeWarningMessages(),
  })
}

function recordBackgroundReconcileWarning(warningMessage: string): void {
  warningSlots.backgroundReconcile = warningMessage
  publishWarningSlots()
}

function clearBackgroundReconcileWarning(): void {
  if (warningSlots.backgroundReconcile == null) {
    return
  }
  warningSlots.backgroundReconcile = null
  publishWarningSlots()
}

function recordBackgroundKeyDiscoveryWarning(warningMessage: string): void {
  warningSlots.keyDiscovery = warningMessage
  publishWarningSlots()
}

function clearBackgroundKeyDiscoveryWarning(): void {
  if (warningSlots.keyDiscovery == null) {
    return
  }
  warningSlots.keyDiscovery = null
  publishWarningSlots()
}

function scheduleBackgroundWorkAfterUserFacingSync(
  syncKind: ArkadeSyncKind,
  syncResult: ArkadeOperatorSyncResult,
): void {
  const worker = getArkadeWorker()
  if (
    shouldScheduleBackgroundKeyDiscovery(
      syncKind,
      backgroundKeyDiscoveryScheduledThisSession,
      syncResult.skippedKeyDiscovery,
    )
  ) {
    if (syncKind === 'postLoad') {
      backgroundKeyDiscoveryScheduledThisSession = true
    }
    worker.scheduleBackgroundKeyDiscovery(
      shouldScheduleBackgroundFullVtxoReconcile(syncResult.fullReconcileDue),
    )
    return
  }
  if (shouldScheduleBackgroundFullVtxoReconcile(syncResult.fullReconcileDue)) {
    worker.scheduleBackgroundFullVtxoReconcile()
  }
}

async function handleBackgroundFullVtxoReconcileFinished(
  outcome: BackgroundFullVtxoReconcileOutcome,
): Promise<void> {
  if (outcome.keyDiscoveryFailed) {
    recordBackgroundKeyDiscoveryWarning(
      outcome.warningMessage ??
        'Offchain receive keys could not be refreshed. Balance may be incomplete until the next successful sync.',
    )
    return
  }
  if (outcome.keyDiscoveryCompleted) {
    clearBackgroundKeyDiscoveryWarning()
  }
  if (!outcome.ok) {
    recordBackgroundReconcileWarning(
      outcome.warningMessage ?? 'Full VTXO reconcile failed',
    )
    return
  }
  if (!outcome.operatorTrustPending) {
    clearBackgroundReconcileWarning()
  }
  const scope = getArkadeSyncLifecycleSnapshot().railScope
  if (scope == null) {
    return
  }
  try {
    await refreshArkadeStoreFromLoadedWasm(scope.arkadeAccountId, scope.walletId)
    if (outcome.operatorTrustPending) {
      await invalidateOperatorTrustQueriesForScope(scope)
    }
    await orchestrateArkadeSave({
      walletId: scope.walletId,
      networkMode: scope.networkMode,
      arkadeAccountId: scope.arkadeAccountId,
    })
  } catch (error) {
    recordBackgroundReconcileWarning(
      userFacingLifecycleErrorMessage(error, LIFECYCLE_SYNC_ERROR_FALLBACK),
    )
  }
}

function ensureBackgroundFullReconcileFollowUp(): void {
  getArkadeWorker().setOnBackgroundFullReconcileFinished(
    proxy((outcome: BackgroundFullVtxoReconcileOutcome) =>
      handleBackgroundFullVtxoReconcileFinished(outcome),
    ),
  )
}

async function refreshLiveDashboardAfterOperatorAttempt(
  scope: ArkadeRailScope,
): Promise<void> {
  await refreshArkadeStoreFromLoadedWasm(scope.arkadeAccountId, scope.walletId)
}

async function runArkadeOperatorSyncBody(
  scope: ArkadeRailScope,
  scheduleBackgroundFull: boolean,
  syncKind: ArkadeSyncKind,
): Promise<ArkadeOperatorSyncResult> {
  ensureBackgroundFullReconcileFollowUp()
  const worker = getArkadeWorker()
  let syncResult: ArkadeOperatorSyncResult
  try {
    syncResult = await worker.syncWithOperator(scheduleBackgroundFull)
  } catch (operatorError) {
    try {
      await refreshLiveDashboardAfterOperatorAttempt(scope)
    } catch (refreshError) {
      console.warn(
        'Arkade live dashboard refresh failed after operator sync error',
        refreshError,
      )
    }
    throw operatorError
  }
  await refreshLiveDashboardAfterOperatorAttempt(scope)
  await invalidateOperatorTrustQueriesForScope(scope)
  scheduleBackgroundWorkAfterUserFacingSync(syncKind, syncResult)
  return syncResult
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

function clearDashboardPollSchedule(): void {
  if (dashboardPollTimer != null) {
    clearTimeout(dashboardPollTimer)
    dashboardPollTimer = null
  }
  dashboardPollQueuedWhileSyncing = false
}

/** Waits for user-facing operator sync only. Background full VTXO reconcile has its own single-flight. */
export async function awaitArkadeSyncQuiescence(): Promise<void> {
  clearDashboardPollSchedule()
  await inFlightSyncTracker.awaitQuiescence()
}

/** Clears sync lifecycle after session teardown (see {@link closeArkadeSession}). */
export function forceResetArkadeSyncLifecycleForTeardown(): void {
  warningSlots = emptyWarningSlots()
  backgroundKeyDiscoveryScheduledThisSession = false
  clearDashboardPollSchedule()
  lastDashboardPollStartedAtMs = 0
  inFlightSyncTracker.clearCurrent()
  setSnapshot({
    syncPhase: 'not-configured',
    railScope: null,
    errorMessage: null,
    warningMessages: [],
  })
}

export function detachArkadeSyncSnapshotIfDifferentWallet(nextWalletId: number): void {
  const scopeWalletId = snapshot.railScope?.walletId
  if (scopeWalletId == null || scopeWalletId === nextWalletId) {
    return
  }
  setSnapshot({
    syncPhase: 'not-configured',
    railScope: null,
    errorMessage: null,
    warningMessages: [],
  })
}

function arkadeSyncTargetsActiveWallet(walletId: number): boolean {
  return useWalletStore.getState().activeWalletId === walletId
}

function clearArkadeSyncSnapshotIfItBelongsToWallet(walletId: number): void {
  if (snapshot.railScope?.walletId !== walletId) {
    return
  }
  setSnapshot({
    syncPhase: 'not-configured',
    railScope: null,
    errorMessage: null,
    warningMessages: [],
  })
}

export function configureArkadeSyncForLoadedRail(scope: ArkadeRailScope): void {
  const configuredForThisWallet =
    snapshot.syncPhase !== 'not-configured' &&
    snapshot.railScope?.walletId === scope.walletId
  if (configuredForThisWallet) {
    return
  }
  setSnapshot({
    syncPhase: 'not-syncing',
    railScope: scope,
    errorMessage: null,
    warningMessages: [],
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
  clearDashboardPollSchedule()
  lastDashboardPollStartedAtMs = 0
  setSnapshot({
    syncPhase: 'not-configured',
    railScope: null,
    errorMessage: null,
    warningMessages: [],
  })
}

async function awaitInFlightSyncWork(
  workPromise: Promise<void>,
  syncKind: ArkadeSyncParams['syncKind'],
): Promise<ArkadeSignerMigrationResult | void> {
  await workPromise
  if (syncKind === 'signerMigration') {
    return signerMigrationResultByInFlightPromise.get(workPromise)
  }
  return undefined
}

export async function orchestrateArkadeSyncThenSave(
  params: ArkadeSyncThenSaveParams,
): Promise<ArkadeSignerMigrationResult | void> {
  const throwOnError = params.throwOnError ?? params.awaitCompletion !== false
  const key = syncKey(params)

  const coalesced = getCoalescedInFlightPromise(inFlightSyncTracker, key)
  if (coalesced != null) {
    return awaitInFlightSyncWork(coalesced, params.syncKind)
  }
  const afterDifferentWork = await awaitDifferentInFlightWork(inFlightSyncTracker, key)
  if (afterDifferentWork != null) {
    return awaitInFlightSyncWork(afterDifferentWork, params.syncKind)
  }

  const workPromise = inFlightSyncTracker.begin(key, async () => {
    if (isArkadeSupportedNetworkMode(params.networkMode)) {
      const sessionMatchesWallet = await getArkadeWorker().hasOpenSession({
        walletId: params.walletId,
        networkMode: params.networkMode,
        arkadeAccountId: params.arkadeAccountId,
      })
      if (!sessionMatchesWallet) {
        return
      }
    }

    try {
      await withWalletWriterLock(async () => {
        assertCanStartArkadeSync(params)
        const scope = railScopeFromParams(params)
        configureArkadeSyncForLoadedRail(scope)

        setSnapshot({
          syncPhase: 'syncing',
          railScope: scope,
          errorMessage: null,
          warningMessages: [],
        })

        try {
          if (params.syncKind === 'signerMigration') {
            const migrationResult = await runArkadeSignerMigrationBody(
              params.onIntentRegistered,
            )
            signerMigrationResultByInFlightPromise.set(workPromise, migrationResult)
            if (migrationResult.migrationComplete) {
              await orchestrateArkadeSave(toSaveParams(params))
            }
            try {
              const syncResult = await runArkadeOperatorSyncBody(
                scope,
                operatorSyncSchedulesBackgroundFull('signerMigration'),
                'signerMigration',
              )
              applySuccessfulArkadeSyncSnapshot(scope, syncResult)
            } catch (syncError) {
              setSnapshot({
                syncPhase: 'sync-error',
                railScope: scope,
                errorMessage: userFacingLifecycleErrorMessage(
                  syncError,
                  LIFECYCLE_SYNC_ERROR_FALLBACK,
                ),
                warningMessages: [],
              })
              params.onSyncError?.(syncError)
            }
            return
          }

          const syncResult = await runArkadeOperatorSyncBody(
            scope,
            operatorSyncSchedulesBackgroundFull(params.syncKind),
            params.syncKind,
          )
          if (!arkadeSyncTargetsActiveWallet(params.walletId)) {
            clearArkadeSyncSnapshotIfItBelongsToWallet(params.walletId)
            return
          }
          applySuccessfulArkadeSyncSnapshot(scope, syncResult)
          try {
            await orchestrateArkadeSave(toSaveParams(params))
          } catch (saveError) {
            if (throwOnError) {
              throw saveError
            }
          }
        } catch (error) {
          if (!arkadeSyncTargetsActiveWallet(params.walletId)) {
            clearArkadeSyncSnapshotIfItBelongsToWallet(params.walletId)
            return
          }
          setSnapshot({
            syncPhase: 'sync-error',
            railScope: scope,
            errorMessage: userFacingLifecycleErrorMessage(error, LIFECYCLE_SYNC_ERROR_FALLBACK),
            warningMessages: [],
          })
          params.onSyncError?.(error)
          if (throwOnError) {
            throw error
          }
        }
      })
    } finally {
      startQueuedDashboardPollAfterSync()
    }
  })

  return awaitInFlightSyncWork(workPromise, params.syncKind)
}

export async function orchestrateArkadePostLoadSync(
  params: ArkadePostLoadSyncParams,
): Promise<void> {
  const awaitCompletion = params.awaitCompletion ?? false
  const work = orchestrateArkadeSyncThenSave({
    walletId: params.walletId,
    networkMode: params.networkMode,
    arkadeAccountId: params.arkadeAccountId,
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

function dashboardPollDelayMs(): number {
  if (lastDashboardPollStartedAtMs === 0) {
    return ARKADE_BACKGROUND_OPERATOR_SYNC_DEBOUNCE_MS
  }
  const elapsedMs = Date.now() - lastDashboardPollStartedAtMs
  const remainingMinIntervalMs = ARKADE_BACKGROUND_OPERATOR_SYNC_MIN_INTERVAL_MS - elapsedMs
  return Math.max(ARKADE_BACKGROUND_OPERATOR_SYNC_DEBOUNCE_MS, remainingMinIntervalMs)
}

function startQueuedDashboardPollAfterSync(): void {
  if (!dashboardPollQueuedWhileSyncing) {
    return
  }
  dashboardPollQueuedWhileSyncing = false
  scheduleBackgroundArkadeOperatorSync()
}

export function scheduleBackgroundArkadeOperatorSync(): void {
  if (dashboardPollTimer != null) {
    return
  }

  dashboardPollTimer = setTimeout(() => {
    dashboardPollTimer = null

    const walletState = useWalletStore.getState()
    const networkMode = getCommittedNetworkMode()
    if (
      walletState.activeWalletId == null ||
      walletState.activeArkadeAccountId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return
    }

    if (inFlightSyncTracker.getCurrent() != null) {
      dashboardPollQueuedWhileSyncing = true
      return
    }

    const walletId = walletState.activeWalletId
    const arkadeAccountId = walletState.activeArkadeAccountId
    void (async () => {
      try {
        const status = await getArkadeWorker().getAutonomousModeStatus()
        // Background dashboard poll talks to the ASP; skip it while autonomous mode is active.
        if (status?.active) {
          return
        }
      } catch {
        // Status unknown: still attempt sync. WASM blocks operator RPC if autonomous.
      }

      lastDashboardPollStartedAtMs = Date.now()
      void orchestrateArkadeSyncThenSave({
        walletId,
        networkMode,
        arkadeAccountId,
        syncKind: 'dashboardPoll',
        awaitCompletion: false,
        throwOnError: false,
      })
    })()
  }, dashboardPollDelayMs())
}

/** @internal Test-only reset */
export function resetArkadeSyncLifecycleStateForTests(): void {
  snapshot = {
    syncPhase: 'not-configured',
    railScope: null,
    errorMessage: null,
    warningMessages: [],
  }
  inFlightSyncTracker.clearCurrent()
  clearDashboardPollSchedule()
  lastDashboardPollStartedAtMs = 0
  warningSlots = emptyWarningSlots()
  backgroundKeyDiscoveryScheduledThisSession = false
  listeners.clear()
}
