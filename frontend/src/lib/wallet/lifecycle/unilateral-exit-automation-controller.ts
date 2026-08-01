import { toast } from 'sonner'
import {
  ESPLORA_FEE_PRESETS_QUERY_KEY,
  presetRatesForNetwork,
} from '@/hooks/useEsploraFeePresets'
import { isUnilateralExitBranchComplete } from '@/lib/arkade/unilateral-exit-branch-complete'
import { resolveAutomatedStepFeeRateSatPerVb } from '@/lib/arkade/unilateral-exit-automation-fees'
import { unilateralExitAutomationWaitPollMs } from '@/lib/arkade/arkade-query-timings'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'
import type {
  UnilateralExitAutomationPausedReason,
  UnilateralExitAutomationSnapshot,
} from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import { getPersistedUnilateralExitJob } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import {
  isUnilateralExitAutomationJobInactive,
  resolveActiveUnilateralExitWalletScope,
  resolveUnilateralExitJobOutpoints,
} from '@/lib/wallet/lifecycle/unilateral-exit-job-scope'
import {
  getUnilateralExitLifecycleSnapshot,
  orchestrateUnilateralExitProceedStep,
  orchestrateUnilateralExitRefreshProgress,
  subscribeUnilateralExitLifecycle,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-orchestrator'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
import type { UnilateralExitWalletScope } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { useWalletStore } from '@/stores/walletStore'
import { getArkadeWorker } from '@/workers/arkade-factory'

let automationSnapshot: UnilateralExitAutomationSnapshot = {
  prefs: { enabled: false, feePresetLabel: 'Medium', maxFeeRateSatPerVb: 10 },
  pausedReason: null,
  lastErrorMessage: null,
  scheduling: 'idle',
}

let advanceTimer: ReturnType<typeof setTimeout> | null = null
let bootstrapSubscribed = false
let orchestratorUnsubscribe: (() => void) | null = null

const automationListeners = new Set<(next: UnilateralExitAutomationSnapshot) => void>()

function notifyAutomationListeners(): void {
  const current = getUnilateralExitAutomationSnapshot()
  for (const listener of automationListeners) {
    listener(current)
  }
}

function setAutomationSnapshot(next: UnilateralExitAutomationSnapshot): void {
  automationSnapshot = next
  notifyAutomationListeners()
}

function activeWalletScope(): UnilateralExitWalletScope | null {
  return resolveActiveUnilateralExitWalletScope()
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

function clearAdvanceTimer(): void {
  if (advanceTimer != null) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
}

async function stopAutomationAfterBranchComplete(
  refreshLifecycle: boolean,
): Promise<void> {
  if (refreshLifecycle) {
    await orchestrateUnilateralExitRefreshProgress()
  }
  toast.success('Unilateral exit branch complete.')
  setAutomationSnapshot({
    ...getUnilateralExitAutomationSnapshot(),
    scheduling: 'idle',
  })
}

export function getUnilateralExitAutomationSnapshot(): UnilateralExitAutomationSnapshot {
  const scope = activeWalletScope()
  const prefs =
    scope != null
      ? useUnilateralExitAutomationPrefsStore.getState().getPrefs(
          scope.walletId,
          scope.networkMode,
          scope.connectionId,
        )
      : automationSnapshot.prefs
  return { ...automationSnapshot, prefs }
}

export function subscribeUnilateralExitAutomation(
  listener: (next: UnilateralExitAutomationSnapshot) => void,
): () => void {
  automationListeners.add(listener)
  return () => {
    automationListeners.delete(listener)
  }
}

export function enableAutomaticUnilateralExit(
  scope: UnilateralExitWalletScope,
  defaultMaxFeeRateSatPerVb?: number,
): void {
  useUnilateralExitAutomationPrefsStore
    .getState()
    .setEnabled(scope, true, defaultMaxFeeRateSatPerVb)
  setAutomationSnapshot({
    ...getUnilateralExitAutomationSnapshot(),
    pausedReason: null,
    lastErrorMessage: null,
    scheduling: 'idle',
  })
  scheduleAutomaticAdvance()
}

export function pauseAutomaticUnilateralExitOnError(message: string): void {
  clearAdvanceTimer()
  setAutomationSnapshot({
    ...getUnilateralExitAutomationSnapshot(),
    pausedReason: 'error',
    lastErrorMessage: message,
    scheduling: 'paused',
  })
}

export function disableAutomaticUnilateralExit(scope: UnilateralExitWalletScope): void {
  useUnilateralExitAutomationPrefsStore.getState().setEnabled(scope, false)
  clearAdvanceTimer()
  setAutomationSnapshot({
    ...getUnilateralExitAutomationSnapshot(),
    pausedReason: 'userDisabled',
    scheduling: 'idle',
  })
}

export function clearAutomaticUnilateralExitPause(scope: UnilateralExitWalletScope): void {
  setAutomationSnapshot({
    ...getUnilateralExitAutomationSnapshot(),
    pausedReason: null,
    lastErrorMessage: null,
    scheduling: 'idle',
  })
  if (useUnilateralExitAutomationPrefsStore.getState().getPrefs(
    scope.walletId,
    scope.networkMode,
    scope.connectionId,
  ).enabled) {
    scheduleAutomaticAdvance()
  }
}

export function setAutomaticUnilateralExitFeePreset(
  scope: UnilateralExitWalletScope,
  feePresetLabel: UnilateralExitAutomationSnapshot['prefs']['feePresetLabel'],
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

export function scheduleAutomaticAdvance(): void {
  clearAdvanceTimer()
  const scope = activeWalletScope()
  if (scope == null) {
    return
  }
  const prefs = useUnilateralExitAutomationPrefsStore
    .getState()
    .getPrefs(scope.walletId, scope.networkMode, scope.connectionId)
  if (!prefs.enabled) {
    setAutomationSnapshot({ ...getUnilateralExitAutomationSnapshot(), scheduling: 'idle' })
    return
  }

  const lifecycle = getUnilateralExitLifecycleSnapshot()
  const persisted = getPersistedUnilateralExitJob(scope)
  const jobOutpoints = resolveUnilateralExitJobOutpoints({
    lifecycleOutpoints: lifecycle.selectedLeafOutpoints,
    persistedJob: persisted,
  })
  if (isUnilateralExitAutomationJobInactive(lifecycle, persisted, jobOutpoints)) {
    setAutomationSnapshot({ ...getUnilateralExitAutomationSnapshot(), scheduling: 'idle' })
    return
  }

  if (automationSnapshot.pausedReason != null && automationSnapshot.pausedReason !== 'userDisabled') {
    return
  }

  const pollMs = unilateralExitAutomationWaitPollMs(scope.networkMode)
  setAutomationSnapshot({ ...getUnilateralExitAutomationSnapshot(), scheduling: 'scheduled' })
  advanceTimer = setTimeout(() => {
    advanceTimer = null
    void runAutomaticAdvanceTick()
  }, pollMs)
}

/** Run one automation tick immediately (e.g. right after enabling automation). */
export function kickAutomaticUnilateralExitAdvance(): void {
  void awaitAutomaticUnilateralExitAdvance()
}

/** Await the in-flight automation tick, or start one when idle. */
export async function awaitAutomaticUnilateralExitAdvance(): Promise<void> {
  if (advanceTickInFlight != null) {
    await advanceTickInFlight
    return
  }
  await runAutomaticAdvanceTick()
}

let advanceTickInFlight: Promise<void> | null = null

async function runAutomaticAdvanceTick(): Promise<void> {
  if (advanceTickInFlight != null) {
    await advanceTickInFlight
    return
  }

  advanceTickInFlight = runAutomaticAdvanceTickBody().finally(() => {
    advanceTickInFlight = null
  })
  await advanceTickInFlight
}

async function runAutomaticAdvanceTickBody(): Promise<void> {
  const scope = activeWalletScope()
  if (scope == null) {
    return
  }
  const prefs = useUnilateralExitAutomationPrefsStore
    .getState()
    .getPrefs(scope.walletId, scope.networkMode, scope.connectionId)
  if (!prefs.enabled) {
    return
  }
  if (!walletIsUnlockedOrSyncing(useWalletStore.getState().walletStatus)) {
    scheduleAutomaticAdvance()
    return
  }
  if (getArkadeLoadLifecycleSnapshot().loadPhase !== 'loaded') {
    scheduleAutomaticAdvance()
    return
  }

  const lifecycle = getUnilateralExitLifecycleSnapshot()
  const persisted = getPersistedUnilateralExitJob(scope)
  const jobOutpoints = resolveUnilateralExitJobOutpoints({
    lifecycleOutpoints: lifecycle.selectedLeafOutpoints,
    persistedJob: persisted,
  })
  if (isUnilateralExitAutomationJobInactive(lifecycle, persisted, jobOutpoints)) {
    setAutomationSnapshot({ ...getUnilateralExitAutomationSnapshot(), scheduling: 'idle' })
    return
  }

  try {
    const progress = await getArkadeWorker().getUnilateralExitProgress({
      vtxoOutpoints: jobOutpoints,
    })
    if (isUnilateralExitBranchComplete(progress)) {
      await stopAutomationAfterBranchComplete(true)
      return
    }

    const { appQueryClient } = await import('@/lib/shared/app-query-client')
    const presetSatPerVbByLabel = await appQueryClient.fetchQuery({
      queryKey: [...ESPLORA_FEE_PRESETS_QUERY_KEY, scope.networkMode] as const,
      queryFn: () => presetRatesForNetwork(scope.networkMode),
    })
    const feeResolution = resolveAutomatedStepFeeRateSatPerVb(
      prefs.feePresetLabel,
      presetSatPerVbByLabel,
      prefs.maxFeeRateSatPerVb,
    )
    if (feeResolution.capExceeded) {
      setAutomationSnapshot({
        ...getUnilateralExitAutomationSnapshot(),
        pausedReason: 'feeCapExceeded',
        lastErrorMessage: null,
        scheduling: 'paused',
      })
      toast.error(pauseReasonToastMessage('feeCapExceeded'))
      return
    }

    const batchEstimate = await getArkadeWorker().estimateUnilateralExitBatch({
      vtxoOutpoints: jobOutpoints,
      feeRateSatPerVb: feeResolution.feeRateSatPerVb,
    })
    if (!batchEstimate.bumperSufficient) {
      setAutomationSnapshot({
        ...getUnilateralExitAutomationSnapshot(),
        pausedReason: 'bumperInsufficient',
        lastErrorMessage: null,
        scheduling: 'paused',
      })
      toast.error(pauseReasonToastMessage('bumperInsufficient'))
      return
    }

    await orchestrateUnilateralExitProceedStep({
      feeRateSatPerVb: feeResolution.feeRateSatPerVb,
    })

    await orchestrateUnilateralExitRefreshProgress()
    const after = getUnilateralExitLifecycleSnapshot()
    if (after.phase === 'complete') {
      await stopAutomationAfterBranchComplete(false)
      return
    }

    setAutomationSnapshot({
      ...getUnilateralExitAutomationSnapshot(),
      pausedReason: null,
      lastErrorMessage: null,
      scheduling: 'idle',
    })
    scheduleAutomaticAdvance()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unroll step failed.'
    setAutomationSnapshot({
      ...getUnilateralExitAutomationSnapshot(),
      pausedReason: 'error',
      lastErrorMessage: message,
      scheduling: 'paused',
    })
    toast.error(pauseReasonToastMessage('error', message))
  }
}

export function bootstrapUnilateralExitAutomation(): void {
  if (bootstrapSubscribed) {
    return
  }
  bootstrapSubscribed = true
  orchestratorUnsubscribe = subscribeUnilateralExitLifecycle(() => {
    const scope = activeWalletScope()
    if (scope == null) {
      return
    }
    const prefs = useUnilateralExitAutomationPrefsStore
      .getState()
      .getPrefs(scope.walletId, scope.networkMode, scope.connectionId)
    if (!prefs.enabled) {
      return
    }
    const lifecycle = getUnilateralExitLifecycleSnapshot()
    if (
      lifecycle.phase === 'waiting-confirm' ||
      lifecycle.phase === 'advancing' ||
      lifecycle.phase === 'idle'
    ) {
      scheduleAutomaticAdvance()
    }
  })
}

export function syncUnilateralExitAutomationWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (shouldSkipRailLifecycleResetForLockPhase(lockPhase, advanceTimer != null)) {
    return
  }
  clearAdvanceTimer()
  automationSnapshot = {
    ...automationSnapshot,
    pausedReason: null,
    lastErrorMessage: null,
    scheduling: 'idle',
  }
  notifyAutomationListeners()
}

/** @internal Test-only reset */
export function resetUnilateralExitAutomationStateForTests(): void {
  clearAdvanceTimer()
  bootstrapSubscribed = false
  orchestratorUnsubscribe?.()
  orchestratorUnsubscribe = null
  automationSnapshot = {
    prefs: { enabled: false, feePresetLabel: 'Medium', maxFeeRateSatPerVb: 10 },
    pausedReason: null,
    lastErrorMessage: null,
    scheduling: 'idle',
  }
  automationListeners.clear()
}
