import { toast } from 'sonner'
import {
  isPersistedUnilateralExitJobStale,
  shouldDeferPersistedUnilateralExitStaleCheck,
} from '@/lib/arkade/unilateral-exit-job-reconcile'
import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'
import { waitForPersistedStoreHydration } from '@/lib/settings/persisted-store-hydration'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { getArkadeSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'
import type { UnilateralExitAutomationPausedReason } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import {
  clearPersistedUnilateralExitJob,
  getPersistedUnilateralExitJob,
  useUnilateralExitLifecyclePersistenceStore,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import type {
  UnilateralExitProceedStepParams,
  UnilateralExitStartParams,
  UnilateralExitWalletScope,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { unilateralExitWalletScopeKey } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { resolveUnilateralExitJobOutpoints } from '@/lib/wallet/lifecycle/unilateral-exit-job-scope'
import { unilateralExitMachineActors } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.actors'
import { resolveVtxoIdsForOutpoints } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-vtxo-ids'
import type { UnilateralExitMachineEvent } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import { unilateralExitMachine } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.machine'
import type { UnilateralExitActorSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import {
  UNILATERAL_EXIT_MACHINE_STATE,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import {
  toUnilateralExitActorSnapshot,
  unilateralExitSnapshotIsInAnyState,
  unilateralExitSnapshotIsInState,
  unilateralExitSnapshotIsProceeding,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-snapshot'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { arkadeVtxoOutpointsEqual } from '@/workers/arkade-api'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { createActor } from 'xstate'

type ActorListener = (snapshot: UnilateralExitActorSnapshot) => void

let actor = createUnilateralExitActor()
const listeners = new Set<ActorListener>()
let lastCompleteToastShown = false
let lastPausedReason: UnilateralExitAutomationPausedReason | null = null

function createUnilateralExitActor() {
  const newActor = createActor(
    unilateralExitMachine.provide({
      actors: unilateralExitMachineActors,
    }),
    {
      input: { pollDelayMs: 2_000 },
    },
  )
  newActor.start()
  return newActor
}

function pauseReasonToastMessage(
  pausedReason: UnilateralExitAutomationPausedReason,
  lastErrorMessage?: string | null,
): string {
  switch (pausedReason) {
    case 'feeCapExceeded':
      return 'Automatic unilateral exit paused: Live fee rate exceeds your maximum.'
    case 'bumperInsufficient':
      return 'Automatic unilateral exit paused: Insufficient bumper balance.'
    case 'userDisabled':
      return 'Automatic unilateral exit disabled.'
    case 'error':
      return lastErrorMessage ?? 'Automatic unilateral exit paused due to an error.'
  }
}

function notifyListeners(): void {
  const snapshot = getUnilateralExitActorSnapshot()
  for (const listener of listeners) {
    listener(snapshot)
  }
}

function handleActorTransition(snapshot: UnilateralExitActorSnapshot): void {
  if (
    unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.complete) &&
    !lastCompleteToastShown
  ) {
    lastCompleteToastShown = true
    toast.success('Unilateral exit branch complete.')
  }
  if (!unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.complete)) {
    lastCompleteToastShown = false
  }

  const pausedReason = snapshot.context.pausedReason
  if (
    unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.paused) &&
    pausedReason != null &&
    pausedReason !== 'userDisabled' &&
    pausedReason !== lastPausedReason
  ) {
    toast.error(
      pauseReasonToastMessage(pausedReason, snapshot.context.lastErrorMessage),
    )
  }
  lastPausedReason = pausedReason
}

function startActorSubscription(): void {
  actor.subscribe((snapshot) => {
    handleActorTransition(toUnilateralExitActorSnapshot(snapshot))
    notifyListeners()
  })
}

startActorSubscription()

export function getUnilateralExitActorSnapshot(): UnilateralExitActorSnapshot {
  return toUnilateralExitActorSnapshot(actor.getSnapshot())
}

export function subscribeUnilateralExitActor(listener: ActorListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function sendUnilateralExitEvent(event: UnilateralExitMachineEvent): void {
  actor.send(event)
}

export async function configureUnilateralExitForLoadedWallet(
  walletScope: UnilateralExitWalletScope,
): Promise<void> {
  await waitForPersistedStoreHydration(useUnilateralExitLifecyclePersistenceStore)

  const current = getUnilateralExitActorSnapshot()
  const scopeMatches =
    current.context.walletScope != null &&
    unilateralExitWalletScopeKey(current.context.walletScope) ===
      unilateralExitWalletScopeKey(walletScope)
  if (
    !unilateralExitSnapshotIsInState(current, UNILATERAL_EXIT_MACHINE_STATE.notConfigured) &&
    scopeMatches
  ) {
    return
  }

  sendUnilateralExitEvent({ type: 'WALLET_CONFIGURED', walletScope })
}

export async function hydrateUnilateralExitFromPersistence(params: {
  walletScope: UnilateralExitWalletScope
  inProgressOutpoints: ArkadeVtxoOutpoint[]
  unilateralExitInProgressSats: number
}): Promise<void> {
  await waitForPersistedStoreHydration(useUnilateralExitLifecyclePersistenceStore)

  const persisted = getPersistedUnilateralExitJob(params.walletScope)
  if (!persisted.jobActive || persisted.selectedLeafOutpoints.length === 0) {
    return
  }

  const loadSnapshot = getArkadeLoadLifecycleSnapshot()
  const syncSnapshot = getArkadeSyncLifecycleSnapshot()
  if (
    shouldDeferPersistedUnilateralExitStaleCheck({
      jobStarted: persisted.jobActive,
      inProgressOutpoints: params.inProgressOutpoints,
      unilateralExitInProgressSats: params.unilateralExitInProgressSats,
      arkadeLoadPhase: loadSnapshot.loadPhase,
      arkadeSyncPhase: syncSnapshot.syncPhase,
    })
  ) {
    return
  }

  if (
    isPersistedUnilateralExitJobStale({
      jobStarted: persisted.jobActive,
      selectedLeafOutpoints: persisted.selectedLeafOutpoints,
      inProgressOutpoints: params.inProgressOutpoints,
      unilateralExitInProgressSats: params.unilateralExitInProgressSats,
    })
  ) {
    clearPersistedUnilateralExitJob(params.walletScope)
    return
  }

  const snapshot = getUnilateralExitActorSnapshot()
  const walletScopeMatches =
    snapshot.context.walletScope != null &&
    unilateralExitWalletScopeKey(snapshot.context.walletScope) ===
      unilateralExitWalletScopeKey(params.walletScope)
  const outpointsMatch = arkadeVtxoOutpointsEqual(
    snapshot.context.jobOutpoints,
    persisted.selectedLeafOutpoints,
  )
  const alreadyReconciling = unilateralExitSnapshotIsInAnyState(snapshot, [
    UNILATERAL_EXIT_MACHINE_STATE.checkingProgress,
    UNILATERAL_EXIT_MACHINE_STATE.evaluatingPolicy,
    UNILATERAL_EXIT_MACHINE_STATE.proceeding,
    UNILATERAL_EXIT_MACHINE_STATE.ensuringBroadcast,
    UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm,
    UNILATERAL_EXIT_MACHINE_STATE.paused,
  ])
  if (walletScopeMatches && outpointsMatch && alreadyReconciling) {
    return
  }
  if (
    walletScopeMatches &&
    outpointsMatch &&
    unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.complete)
  ) {
    return
  }
  if (
    walletScopeMatches &&
    outpointsMatch &&
    unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.idle) &&
    snapshot.context.progress != null
  ) {
    return
  }

  const prefs = useUnilateralExitAutomationPrefsStore
    .getState()
    .getPrefs(
      params.walletScope.walletId,
      params.walletScope.networkMode,
      params.walletScope.connectionId,
    )

  sendUnilateralExitEvent({
    type: 'HYDRATE_OR_START',
    walletScope: params.walletScope,
    outpoints: persisted.selectedLeafOutpoints,
    automationEnabled: prefs.enabled,
    resumeAutomation: false,
    reconcileInProgressSats: params.unilateralExitInProgressSats,
    reconcileInProgressOutpoints: params.inProgressOutpoints,
  })

  await waitForUnilateralExitActorSettled()
}

export function startManualUnilateralExit(
  params: UnilateralExitStartParams,
): UnilateralExitActorSnapshot {
  sendUnilateralExitEvent({
    type: 'START_MANUAL',
    walletScope: params.walletScope,
    outpoints: params.outpoints,
    feeRateSatPerVb: params.feeRateSatPerVb,
  })
  return getUnilateralExitActorSnapshot()
}

export async function startManualUnilateralExitAsync(
  params: UnilateralExitStartParams,
): Promise<UnilateralExitActorSnapshot> {
  startManualUnilateralExit(params)
  await waitForUnilateralExitActorSettled()
  return getUnilateralExitActorSnapshot()
}

export function startAutomaticUnilateralExit(params: {
  walletScope: UnilateralExitWalletScope
  outpoints: ArkadeVtxoOutpoint[]
}): UnilateralExitActorSnapshot {
  sendUnilateralExitEvent({
    type: 'START_AUTOMATIC',
    walletScope: params.walletScope,
    outpoints: params.outpoints,
  })
  return getUnilateralExitActorSnapshot()
}

export async function startAutomaticUnilateralExitAsync(params: {
  walletScope: UnilateralExitWalletScope
  outpoints: ArkadeVtxoOutpoint[]
}): Promise<UnilateralExitActorSnapshot> {
  startAutomaticUnilateralExit(params)
  await waitForUnilateralExitActorSettled()
  return getUnilateralExitActorSnapshot()
}

export async function proceedManualUnilateralExitStep(
  params: UnilateralExitProceedStepParams,
): Promise<UnilateralExitActorSnapshot> {
  sendUnilateralExitEvent({
    type: 'PROCEED_MANUAL',
    feeRateSatPerVb: params.feeRateSatPerVb,
  })
  await waitForUnilateralExitActorSettled()
  return getUnilateralExitActorSnapshot()
}

export function clearUnilateralExitJob(): void {
  sendUnilateralExitEvent({ type: 'CLEAR_JOB' })
}

export async function abortUnilateralExitOrchestration(
  scope: UnilateralExitWalletScope,
): Promise<void> {
  const snapshot = getUnilateralExitActorSnapshot()
  const jobOutpoints = snapshot.context.jobOutpoints
  if (jobOutpoints.length === 0) {
    return
  }

  const worker = getArkadeWorker()
  const [candidates, inProgressRows] = await Promise.all([
    worker.listExitCandidates(),
    worker.listUnilateralExitsInProgress(),
  ])
  const vtxoIds = resolveVtxoIdsForOutpoints(jobOutpoints, candidates, inProgressRows)

  disableAutomaticUnilateralExit(scope)

  void import('@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.actors').then(
    (module) => module.invalidateUnilateralExitQueries(scope, jobOutpoints),
  )

  sendUnilateralExitEvent({ type: 'ABORT_ORCHESTRATION', vtxoIds })
  await waitForUnilateralExitActorSettled()
}

export function enableAutomaticUnilateralExit(
  scope: UnilateralExitWalletScope,
  defaultMaxFeeRateSatPerVbValue?: number,
): void {
  useUnilateralExitAutomationPrefsStore
    .getState()
    .setEnabled(scope, true, defaultMaxFeeRateSatPerVbValue)
  sendUnilateralExitEvent({ type: 'AUTOMATION_PREFS_CHANGED', automationEnabled: true })
}

export function disableAutomaticUnilateralExit(scope: UnilateralExitWalletScope): void {
  useUnilateralExitAutomationPrefsStore.getState().setEnabled(scope, false)
  sendUnilateralExitEvent({ type: 'AUTOMATION_PREFS_CHANGED', automationEnabled: false })
}

export function clearAutomaticUnilateralExitPause(scope: UnilateralExitWalletScope): void {
  sendUnilateralExitEvent({ type: 'RESUME' })
  if (
    useUnilateralExitAutomationPrefsStore
      .getState()
      .getPrefs(scope.walletId, scope.networkMode, scope.connectionId).enabled
  ) {
    sendUnilateralExitEvent({ type: 'AUTOMATION_PREFS_CHANGED', automationEnabled: true })
  }
}

export function setAutomaticUnilateralExitFeePreset(
  scope: UnilateralExitWalletScope,
  feePresetLabel: SendFeePresetLabel,
): void {
  useUnilateralExitAutomationPrefsStore.getState().setFeePresetLabel(scope, feePresetLabel)
  clearAutomaticUnilateralExitPause(scope)
}

export function setAutomaticUnilateralExitMaxFeeRate(
  scope: UnilateralExitWalletScope,
  maxFeeRateSatPerVb: number,
): void {
  useUnilateralExitAutomationPrefsStore.getState().setMaxFeeRateSatPerVb(scope, maxFeeRateSatPerVb)
  clearAutomaticUnilateralExitPause(scope)
}

export function syncUnilateralExitWithLockPhase(lockPhase: LockLifecyclePhase): void {
  const snapshot = getUnilateralExitActorSnapshot()
  const hasInFlightWork = unilateralExitSnapshotIsProceeding(snapshot)
  if (shouldSkipRailLifecycleResetForLockPhase(lockPhase, hasInFlightWork)) {
    return
  }
  sendUnilateralExitEvent({ type: 'WALLET_RESET' })
}

export function bootstrapUnilateralExitAutomation(): void {
  // Actor handles automation polling internally via waitingConfirm.after.
}

export async function waitForUnilateralExitActorSettled(
  timeoutMs = 120_000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const snapshot = getUnilateralExitActorSnapshot()
    if (!unilateralExitSnapshotIsProceeding(snapshot)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Unilateral exit actor did not settle in time')
}

export function resetUnilateralExitActorForTests(): void {
  actor.stop()
  listeners.clear()
  lastCompleteToastShown = false
  lastPausedReason = null
  actor = createUnilateralExitActor()
  startActorSubscription()
}

export async function refreshUnilateralExitProgress(): Promise<UnilateralExitActorSnapshot> {
  const snapshot = getUnilateralExitActorSnapshot()
  const scope = snapshot.context.walletScope
  const persisted = scope != null ? getPersistedUnilateralExitJob(scope) : null
  const outpoints = resolveUnilateralExitJobOutpoints({
    lifecycleOutpoints: snapshot.context.jobOutpoints,
    persistedJob: persisted ?? undefined,
  })
  if (scope == null || outpoints.length === 0) {
    return snapshot
  }
  sendUnilateralExitEvent({
    type: 'HYDRATE_OR_START',
    walletScope: scope,
    outpoints,
    automationEnabled: snapshot.context.automationEnabled,
    resumeAutomation: snapshot.context.automationEnabled,
    reconcileInProgressSats: snapshot.context.reconcileInProgressSats,
    reconcileInProgressOutpoints: snapshot.context.reconcileInProgressOutpoints,
  })
  await waitForUnilateralExitActorSettled()
  return getUnilateralExitActorSnapshot()
}
