import {
  isUnilateralExitBranchComplete,
  mapWasmProgressToLifecyclePhase,
} from '@/lib/arkade/unilateral-exit-branch-complete'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import {
  arkadeBalanceQueryKey,
  arkadeUnilateralExitProgressQueryKey,
  arkadeUnilateralExitTopologyScopeKey,
} from '@/lib/arkade/arkade-query-keys'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { proceedUnilateralExitStepWithGuards } from '@/lib/arkade/proceed-unilateral-exit-step'
import { isPersistedUnilateralExitJobStale } from '@/lib/arkade/unilateral-exit-job-reconcile'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import {
  clearPersistedUnilateralExitJob,
  getPersistedUnilateralExitJob,
  persistActiveUnilateralExitJob,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import type {
  UnilateralExitLifecycleSnapshot,
  UnilateralExitProceedStepParams,
  UnilateralExitStartParams,
  UnilateralExitWalletScope,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { unilateralExitWalletScopeKey } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import {
  createInFlightLifecycleTracker,
  getCoalescedInFlightPromise,
} from '@/lib/wallet/lifecycle/lifecycle-in-flight-tracker'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
import {
  LIFECYCLE_SYNC_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'
import type { ArkadeUnilateralExitProgress, ArkadeVtxoOutpoint } from '@/workers/arkade-api'

export type {
  UnilateralExitLifecyclePhase,
  UnilateralExitLifecycleSnapshot,
  UnilateralExitProceedStepParams,
  UnilateralExitStartParams,
  UnilateralExitWalletScope,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'

export { unilateralExitWalletScopeKey } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'

const PROCEED_IN_FLIGHT_KEY = 'unilateral-exit-proceed'

let snapshot: UnilateralExitLifecycleSnapshot = {
  phase: 'not-configured',
  walletScope: null,
  selectedLeafOutpoints: [],
  progress: null,
  lastErrorMessage: null,
}

const listeners = new Set<(next: UnilateralExitLifecycleSnapshot) => void>()
const inFlightProceedTracker = createInFlightLifecycleTracker()

function notifyListeners(): void {
  const current = getUnilateralExitLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
}

function setSnapshot(next: UnilateralExitLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

function notConfiguredSnapshot(): UnilateralExitLifecycleSnapshot {
  return {
    phase: 'not-configured',
    walletScope: null,
    selectedLeafOutpoints: [],
    progress: null,
    lastErrorMessage: null,
  }
}

function idleSnapshot(walletScope: UnilateralExitWalletScope): UnilateralExitLifecycleSnapshot {
  return {
    phase: 'idle',
    walletScope,
    selectedLeafOutpoints: [],
    progress: null,
    lastErrorMessage: null,
  }
}

function snapshotFromProgress(
  walletScope: UnilateralExitWalletScope,
  outpoints: ArkadeVtxoOutpoint[],
  progress: ArkadeUnilateralExitProgress,
  advancing: boolean,
): UnilateralExitLifecycleSnapshot {
  const mapped = mapWasmProgressToLifecyclePhase(progress)
  let phase: UnilateralExitLifecycleSnapshot['phase'] = 'idle'
  if (mapped === 'complete' && isUnilateralExitBranchComplete(progress)) {
    phase = 'complete'
  } else if (mapped === 'waiting-confirm') {
    phase = 'waiting-confirm'
  } else if (advancing) {
    phase = 'advancing'
  } else if (mapped === 'complete') {
    phase = 'waiting-confirm'
  }

  return {
    phase,
    walletScope,
    selectedLeafOutpoints: outpoints,
    progress,
    lastErrorMessage: null,
  }
}

function activeWalletScopeFromStore(): UnilateralExitWalletScope | null {
  const walletState = useWalletStore.getState()
  const networkMode = getCommittedNetworkMode()
  if (
    walletState.activeWalletId == null ||
    walletState.activeArkadeConnectionId == null ||
    !isArkadeSupportedNetworkMode(networkMode)
  ) {
    return null
  }
  return {
    walletId: walletState.activeWalletId,
    networkMode,
    connectionId: walletState.activeArkadeConnectionId,
  }
}

function assertCanRunUnilateralExit(scope: UnilateralExitWalletScope): void {
  if (!walletIsUnlockedOrSyncing(useWalletStore.getState().walletStatus)) {
    throw new Error('Wallet must be unlocked')
  }
  if (!isArkadeActiveForNetworkMode(scope.networkMode)) {
    throw new Error('Arkade is not enabled for this network')
  }
  if (!isArkadeSupportedNetworkMode(scope.networkMode)) {
    throw new Error('Arkade is not supported on this network')
  }
  const loadSnapshot = getArkadeLoadLifecycleSnapshot()
  if (loadSnapshot.loadPhase === 'loading') {
    throw new Error('Unilateral exit cannot start while Arkade load is in progress')
  }
  if (loadSnapshot.loadPhase !== 'loaded') {
    throw new Error('Unilateral exit requires a loaded Arkade session')
  }
  const activeScope = activeWalletScopeFromStore()
  if (
    activeScope == null ||
    activeScope.walletId !== scope.walletId ||
    activeScope.networkMode !== scope.networkMode ||
    activeScope.connectionId !== scope.connectionId
  ) {
    throw new Error('Active wallet does not match unilateral exit job scope')
  }
}

async function fetchProgress(
  outpoints: ArkadeVtxoOutpoint[],
): Promise<ArkadeUnilateralExitProgress> {
  const worker = getArkadeWorker()
  return worker.getUnilateralExitProgress({
    vtxoOutpoints: sortArkadeVtxoOutpoints(outpoints),
  })
}

async function invalidateUnilateralExitQueries(
  scope: UnilateralExitWalletScope,
  outpoints: ArkadeVtxoOutpoint[],
): Promise<void> {
  if (!isArkadeSupportedNetworkMode(scope.networkMode)) {
    return
  }
  const sortedOutpoints = sortArkadeVtxoOutpoints(outpoints)
  const { appQueryClient } = await import('@/lib/shared/app-query-client')
  await appQueryClient.invalidateQueries({
    queryKey: arkadeUnilateralExitProgressQueryKey(
      scope.walletId,
      scope.networkMode,
      scope.connectionId,
      sortedOutpoints,
    ),
  })
  await appQueryClient.invalidateQueries({
    queryKey: arkadeBalanceQueryKey(scope.walletId, scope.networkMode, scope.connectionId),
  })
  await appQueryClient.invalidateQueries({
    queryKey: arkadeUnilateralExitTopologyScopeKey(
      scope.walletId,
      scope.networkMode,
      scope.connectionId,
    ),
  })
}

async function runProceedBody(
  scope: UnilateralExitWalletScope,
  outpoints: ArkadeVtxoOutpoint[],
  feeRateSatPerVb: number,
): Promise<UnilateralExitLifecycleSnapshot> {
  assertCanRunUnilateralExit(scope)
  const sortedOutpoints = sortArkadeVtxoOutpoints(outpoints)
  if (sortedOutpoints.length === 0) {
    throw new Error('Select at least one exit-eligible VTXO leaf.')
  }

  setSnapshot({
    phase: 'advancing',
    walletScope: scope,
    selectedLeafOutpoints: sortedOutpoints,
    progress: snapshot.progress,
    lastErrorMessage: null,
  })

  let progress = await fetchProgress(sortedOutpoints)
  if (isUnilateralExitBranchComplete(progress)) {
    const completeSnapshot = snapshotFromProgress(scope, sortedOutpoints, progress, false)
    setSnapshot({ ...completeSnapshot, phase: 'complete' })
    await invalidateUnilateralExitQueries(scope, sortedOutpoints)
    return getUnilateralExitLifecycleSnapshot()
  }

  await proceedUnilateralExitStepWithGuards({
    activeWalletId: scope.walletId,
    vtxoOutpoints: sortedOutpoints,
    feeRateSatPerVb,
  })

  progress = await fetchProgress(sortedOutpoints)
  const nextSnapshot = snapshotFromProgress(scope, sortedOutpoints, progress, false)
  if (isUnilateralExitBranchComplete(progress)) {
    setSnapshot({ ...nextSnapshot, phase: 'complete' })
  } else {
    setSnapshot(nextSnapshot)
  }
  await invalidateUnilateralExitQueries(scope, sortedOutpoints)
  return getUnilateralExitLifecycleSnapshot()
}

export function getUnilateralExitLifecycleSnapshot(): UnilateralExitLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeUnilateralExitLifecycle(
  listener: (next: UnilateralExitLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function configureUnilateralExitLifecycleForLoadedWallet(
  walletScope: UnilateralExitWalletScope,
): void {
  const scopeMatches =
    snapshot.walletScope != null &&
    unilateralExitWalletScopeKey(snapshot.walletScope) ===
      unilateralExitWalletScopeKey(walletScope)
  if (snapshot.phase !== 'not-configured' && scopeMatches) {
    return
  }
  const persisted = getPersistedUnilateralExitJob(walletScope)
  if (persisted.jobActive && persisted.selectedLeafOutpoints.length > 0) {
    setSnapshot({
      phase: 'idle',
      walletScope,
      selectedLeafOutpoints: persisted.selectedLeafOutpoints,
      progress: null,
      lastErrorMessage: null,
    })
    return
  }
  setSnapshot(idleSnapshot(walletScope))
}

export async function hydrateUnilateralExitJobFromPersistence(params: {
  walletScope: UnilateralExitWalletScope
  inProgressOutpoints: ArkadeVtxoOutpoint[]
  unilateralExitInProgressSats: number
}): Promise<void> {
  const persisted = getPersistedUnilateralExitJob(params.walletScope)
  if (
    isPersistedUnilateralExitJobStale({
      jobStarted: persisted.jobActive,
      selectedLeafOutpoints: persisted.selectedLeafOutpoints,
      inProgressOutpoints: params.inProgressOutpoints,
      unilateralExitInProgressSats: params.unilateralExitInProgressSats,
    })
  ) {
    clearPersistedUnilateralExitJob(params.walletScope)
    if (
      snapshot.walletScope != null &&
      unilateralExitWalletScopeKey(snapshot.walletScope) ===
        unilateralExitWalletScopeKey(params.walletScope)
    ) {
      setSnapshot(idleSnapshot(params.walletScope))
    }
    return
  }

  if (!persisted.jobActive || persisted.selectedLeafOutpoints.length === 0) {
    return
  }

  try {
    const progress = await fetchProgress(persisted.selectedLeafOutpoints)
    const next = snapshotFromProgress(
      params.walletScope,
      persisted.selectedLeafOutpoints,
      progress,
      false,
    )
    setSnapshot(
      isUnilateralExitBranchComplete(progress)
        ? { ...next, phase: 'complete' }
        : next,
    )
  } catch {
    setSnapshot({
      phase: 'idle',
      walletScope: params.walletScope,
      selectedLeafOutpoints: persisted.selectedLeafOutpoints,
      progress: null,
      lastErrorMessage: null,
    })
  }
}

export function orchestrateUnilateralExitPrepareStart(
  params: Omit<UnilateralExitStartParams, 'feeRateSatPerVb'>,
): UnilateralExitLifecycleSnapshot {
  const sortedOutpoints = sortArkadeVtxoOutpoints(params.outpoints)
  persistActiveUnilateralExitJob(params.walletScope, sortedOutpoints)
  setSnapshot({
    phase: 'idle',
    walletScope: params.walletScope,
    selectedLeafOutpoints: sortedOutpoints,
    progress: null,
    lastErrorMessage: null,
  })
  return getUnilateralExitLifecycleSnapshot()
}

export async function orchestrateUnilateralExitStart(
  params: UnilateralExitStartParams,
): Promise<UnilateralExitLifecycleSnapshot> {
  const sortedOutpoints = sortArkadeVtxoOutpoints(params.outpoints)
  persistActiveUnilateralExitJob(params.walletScope, sortedOutpoints)
  setSnapshot({
    phase: 'advancing',
    walletScope: params.walletScope,
    selectedLeafOutpoints: sortedOutpoints,
    progress: snapshot.progress,
    lastErrorMessage: null,
  })
  return orchestrateUnilateralExitProceedStep({
    feeRateSatPerVb: params.feeRateSatPerVb,
  })
}

export async function orchestrateUnilateralExitProceedStep(
  params: UnilateralExitProceedStepParams,
): Promise<UnilateralExitLifecycleSnapshot> {
  const scope = snapshot.walletScope ?? activeWalletScopeFromStore()
  if (scope == null) {
    throw new Error('No active unilateral exit job scope')
  }

  const persisted = getPersistedUnilateralExitJob(scope)
  const outpoints =
    snapshot.selectedLeafOutpoints.length > 0
      ? snapshot.selectedLeafOutpoints
      : persisted.selectedLeafOutpoints
  if (!persisted.jobActive && outpoints.length === 0) {
    throw new Error('No active unilateral exit job')
  }
  if (!persisted.jobActive && outpoints.length > 0) {
    persistActiveUnilateralExitJob(scope, outpoints)
  }

  const coalesced = getCoalescedInFlightPromise(inFlightProceedTracker, PROCEED_IN_FLIGHT_KEY)
  if (coalesced != null) {
    await coalesced
    return getUnilateralExitLifecycleSnapshot()
  }

  try {
    await inFlightProceedTracker.begin(PROCEED_IN_FLIGHT_KEY, async () => {
      await runProceedBody(scope, outpoints, params.feeRateSatPerVb)
    })
    return getUnilateralExitLifecycleSnapshot()
  } catch (error) {
    const message = userFacingLifecycleErrorMessage(error, LIFECYCLE_SYNC_ERROR_FALLBACK)
    setSnapshot({
      ...snapshot,
      phase: 'error',
      walletScope: scope,
      selectedLeafOutpoints: outpoints,
      lastErrorMessage: message,
    })
    throw error
  }
}

export async function orchestrateUnilateralExitRefreshProgress(): Promise<UnilateralExitLifecycleSnapshot> {
  const scope = snapshot.walletScope ?? activeWalletScopeFromStore()
  if (scope == null) {
    return getUnilateralExitLifecycleSnapshot()
  }
  const persisted = getPersistedUnilateralExitJob(scope)
  const outpoints =
    snapshot.selectedLeafOutpoints.length > 0
      ? snapshot.selectedLeafOutpoints
      : persisted.selectedLeafOutpoints
  if (outpoints.length === 0) {
    return getUnilateralExitLifecycleSnapshot()
  }
  assertCanRunUnilateralExit(scope)
  const progress = await fetchProgress(outpoints)
  const next = snapshotFromProgress(scope, outpoints, progress, false)
  setSnapshot(
    isUnilateralExitBranchComplete(progress) ? { ...next, phase: 'complete' } : next,
  )
  await invalidateUnilateralExitQueries(scope, outpoints)
  return getUnilateralExitLifecycleSnapshot()
}

export function orchestrateUnilateralExitClearJob(): void {
  const scope = snapshot.walletScope ?? activeWalletScopeFromStore()
  if (scope != null) {
    clearPersistedUnilateralExitJob(scope)
    setSnapshot(idleSnapshot(scope))
    return
  }
  setSnapshot(notConfiguredSnapshot())
}

export function syncUnilateralExitLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (
    shouldSkipRailLifecycleResetForLockPhase(
      lockPhase,
      inFlightProceedTracker.getCurrent() != null,
    )
  ) {
    return
  }
  inFlightProceedTracker.clearCurrent()
  setSnapshot(notConfiguredSnapshot())
}

export function forceResetUnilateralExitLifecycleForTeardown(): void {
  inFlightProceedTracker.clearCurrent()
  setSnapshot(notConfiguredSnapshot())
}

/** @internal Test-only reset */
export function resetUnilateralExitLifecycleStateForTests(): void {
  snapshot = notConfiguredSnapshot()
  inFlightProceedTracker.clearCurrent()
  listeners.clear()
}
