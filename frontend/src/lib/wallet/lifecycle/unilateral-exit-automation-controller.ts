import { toast } from 'sonner'
import {
  ESPLORA_FEE_PRESETS_QUERY_KEY,
  presetRatesForNetwork,
} from '@/hooks/useEsploraFeePresets'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { resolveAutomatedStepFeeRateSatPerVb } from '@/lib/arkade/unilateral-exit-automation-fees'
import { unilateralExitAutomationWaitPollMs } from '@/lib/arkade/arkade-query-timings'
import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'
import type {
  UnilateralExitAutomationPausedReason,
  UnilateralExitAutomationSnapshot,
} from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import type { UnilateralExitWalletScope } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { getPersistedUnilateralExitJob } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import {
  getUnilateralExitLifecycleSnapshot,
  orchestrateUnilateralExitProceedStep,
  orchestrateUnilateralExitRefreshProgress,
  subscribeUnilateralExitLifecycle,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-orchestrator'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'

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
  const jobOutpoints =
    lifecycle.selectedLeafOutpoints.length > 0
      ? lifecycle.selectedLeafOutpoints
      : persisted.selectedLeafOutpoints
  if (
    lifecycle.phase === 'complete' ||
    lifecycle.phase === 'error' ||
    lifecycle.phase === 'not-configured' ||
    (!persisted.jobActive && jobOutpoints.length === 0)
  ) {
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
  void runAutomaticAdvanceTick()
}

let advanceTickInFlight: Promise<void> | null = null

async function runAutomaticAdvanceTick(): Promise<void> {
  if (advanceTickInFlight != null) {
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
  if (
    lifecycle.phase === 'complete' ||
    lifecycle.phase === 'not-configured' ||
    lifecycle.selectedLeafOutpoints.length === 0
  ) {
    setAutomationSnapshot({ ...getUnilateralExitAutomationSnapshot(), scheduling: 'idle' })
    return
  }

  try {
    const outpoints = sortArkadeVtxoOutpoints(lifecycle.selectedLeafOutpoints)
    const shouldSkipPreflightProgress =
      lifecycle.phase === 'idle' && lifecycle.progress == null
    if (!shouldSkipPreflightProgress) {
      const progress = await getArkadeWorker().getUnilateralExitProgress({
        vtxoOutpoints: outpoints,
      })
      if (progress.phase === 'complete') {
        toast.success('Unilateral exit branch complete.')
        setAutomationSnapshot({ ...getUnilateralExitAutomationSnapshot(), scheduling: 'idle' })
        return
      }
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
      vtxoOutpoints: outpoints,
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
      toast.success('Unilateral exit branch complete.')
      setAutomationSnapshot({ ...getUnilateralExitAutomationSnapshot(), scheduling: 'idle' })
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
  setAutomationSnapshot({
    prefs: automationSnapshot.prefs,
    pausedReason: null,
    lastErrorMessage: null,
    scheduling: 'idle',
  })
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
