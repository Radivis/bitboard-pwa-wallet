import { isUnilateralExitJobComplete } from '@/lib/arkade/unilateral-exit-branch-complete'
import {
  isWaitingForRelayedStepConfirmation,
  needsBroadcastEnsurance,
  rewoundProgressFromPackageError,
  isRetryableUnconfirmedParentPackageError,
  unconfirmedParentRetryFromProgress,
} from '@/lib/arkade/unilateral-exit-broadcast'
import { unilateralExitAutomationWaitPollMs } from '@/lib/arkade/arkade-query-timings'
import {
  clearPersistedUnilateralExitJob,
  ensurePersistedUnilateralExitJob,
  getPersistedUnilateralExitJob,
  persistActiveUnilateralExitJob,
  updatePersistedUnilateralExitRelayWait,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import {
  buildPersistedUnilateralExitFailure,
  getPersistedUnilateralExitFailure,
  persistUnilateralExitFailureRecord,
} from '@/lib/wallet/lifecycle/unilateral-exit-failure-persistence'
import type { UnilateralExitFailureReasonCode } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import {
  createInitialUnilateralExitContext,
  type UnilateralExitMachineContext,
  type UnilateralExitMachineSetupEvent,
  type UnilateralExitMachineInput,
  type UnilateralExitPolicyEvaluation,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import { invalidateUnilateralExitQueries } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-query-cache'
import type { ArkadeUnilateralExitProgress, ArkadeUnilateralExitJobViability } from '@/workers/arkade-api'
import { arkadeVtxoOutpointListsEqual, sortArkadeVtxoOutpoints } from '@/workers/arkade-api'
import { assertEvent, assign, fromPromise, setup, type PromiseActorLogic } from 'xstate'

export type EnsureBroadcastActorInput = {
  walletScope: NonNullable<UnilateralExitMachineContext['walletScope']>
  outpoints: UnilateralExitMachineContext['jobOutpoints']
  feeRateSatPerVb: number | null
  automationEnabled: boolean
}

export type FetchProgressActorInput = {
  walletScope: UnilateralExitMachineContext['walletScope']
  outpoints: UnilateralExitMachineContext['jobOutpoints']
}

export type EvaluateJobViabilityActorInput = {
  outpoints: UnilateralExitMachineContext['jobOutpoints']
}

export type ProceedStepActorInput = {
  walletScope: NonNullable<UnilateralExitMachineContext['walletScope']>
  outpoints: UnilateralExitMachineContext['jobOutpoints']
  feeRateSatPerVb: number
}

export type EvaluateAutomationPolicyActorInput = {
  walletScope: NonNullable<UnilateralExitMachineContext['walletScope']>
  outpoints: UnilateralExitMachineContext['jobOutpoints']
}

export type ResolveAbortVtxoIdsActorInput = {
  outpoints: UnilateralExitMachineContext['jobOutpoints']
}

type UnilateralExitSetupActors = {
  evaluateJobViabilityActor: PromiseActorLogic<
    ArkadeUnilateralExitJobViability,
    EvaluateJobViabilityActorInput
  >
  fetchProgressActor: PromiseActorLogic<ArkadeUnilateralExitProgress, FetchProgressActorInput>
  evaluateAutomationPolicyActor: PromiseActorLogic<
    UnilateralExitPolicyEvaluation,
    EvaluateAutomationPolicyActorInput
  >
  proceedStepActor: PromiseActorLogic<ArkadeUnilateralExitProgress, ProceedStepActorInput>
  ensureBroadcastActor: PromiseActorLogic<ArkadeUnilateralExitProgress, EnsureBroadcastActorInput>
  resolveAbortVtxoIdsActor: PromiseActorLogic<{ vtxoIds: string[] }, ResolveAbortVtxoIdsActorInput>
}

export function requireUnilateralExitWalletScope(
  walletScope: UnilateralExitMachineContext['walletScope'],
): NonNullable<UnilateralExitMachineContext['walletScope']> {
  if (walletScope == null) {
    throw new Error('Unilateral exit requires a configured wallet scope')
  }
  return walletScope
}

export function requireUnilateralExitFeeRateSatPerVb(feeRateSatPerVb: number | null): number {
  if (feeRateSatPerVb == null) {
    throw new Error('Fee rate is required to proceed with a unilateral exit step')
  }
  return feeRateSatPerVb
}

function actorErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function isTerminalViabilityStatus(
  viability: ArkadeUnilateralExitJobViability,
): boolean {
  return viability?.status === 'aspSweptTargets' || viability?.status === 'branchFundingLost'
}

function progressFromFetchEvent(
  event: UnilateralExitMachineSetupEvent,
): ArkadeUnilateralExitProgress {
  assertEvent(event, 'xstate.done.actor.fetchProgress')
  return event.output
}

function progressFromProceedEvent(
  event: UnilateralExitMachineSetupEvent,
): ArkadeUnilateralExitProgress {
  assertEvent(event, 'xstate.done.actor.proceedStep')
  return event.output
}

function progressFromEnsureBroadcastEvent(
  event: UnilateralExitMachineSetupEvent,
): ArkadeUnilateralExitProgress {
  assertEvent(event, 'xstate.done.actor.ensureBroadcast')
  return event.output
}

function errorFromProceedOrEnsureBroadcast(event: UnilateralExitMachineSetupEvent): unknown {
  assertEvent(event, ['xstate.error.actor.ensureBroadcast', 'xstate.error.actor.proceedStep'])
  return event.error
}

function stepIndexAdvancedPastContext(
  previous: ArkadeUnilateralExitProgress | null,
  next: ArkadeUnilateralExitProgress | null,
): boolean {
  if (previous == null || next == null) {
    return false
  }
  return next.stepIndex > previous.stepIndex
}

function relayWaitUnixFromProgress(
  progress: ArkadeUnilateralExitProgress | null,
): number | null {
  if (progress == null) {
    return null
  }
  if (progress.currentStepWaitingSince != null) {
    return progress.currentStepWaitingSince
  }
  return null
}

function syncPersistedRelayWait(
  walletScope: UnilateralExitMachineContext['walletScope'],
  progress: ArkadeUnilateralExitProgress | null,
): void {
  if (walletScope == null) {
    return
  }
  updatePersistedUnilateralExitRelayWait(
    walletScope,
    relayWaitUnixFromProgress(progress),
  )
}

function isJobCompleteFromProgress(
  progress: ArkadeUnilateralExitProgress | null,
  context: UnilateralExitMachineContext,
): boolean {
  if (progress == null) {
    return false
  }
  return isUnilateralExitJobComplete(progress, context.jobOutpoints)
}

export const unilateralExitMachineSetup = setup({
  types: {
    context: {} as UnilateralExitMachineContext,
    events: {} as UnilateralExitMachineSetupEvent,
    input: {} as UnilateralExitMachineInput,
    children: {} as {
      evaluateJobViability: 'evaluateJobViabilityActor'
      fetchProgress: 'fetchProgressActor'
      evaluateAutomationPolicy: 'evaluateAutomationPolicyActor'
      proceedStep: 'proceedStepActor'
      ensureBroadcast: 'ensureBroadcastActor'
      resolveAbortVtxoIds: 'resolveAbortVtxoIdsActor'
    },
  },
  delays: {
    pollDelay: ({ context }) => context.pollDelayMs,
    parentDataWait: ({ context }) => context.parentDataWaitMs,
  },
  actors: {
    evaluateJobViabilityActor: fromPromise<ArkadeUnilateralExitJobViability, EvaluateJobViabilityActorInput>(
      async () => {
        throw new Error('evaluateJobViabilityActor implementation missing')
      },
    ),
    fetchProgressActor: fromPromise<ArkadeUnilateralExitProgress, FetchProgressActorInput>(
      async () => {
        throw new Error('fetchProgressActor implementation missing')
      },
    ),
    evaluateAutomationPolicyActor: fromPromise<
      UnilateralExitPolicyEvaluation,
      EvaluateAutomationPolicyActorInput
    >(async () => {
      throw new Error('evaluateAutomationPolicyActor implementation missing')
    }),
    proceedStepActor: fromPromise<ArkadeUnilateralExitProgress, ProceedStepActorInput>(
      async () => {
        throw new Error('proceedStepActor implementation missing')
      },
    ),
    ensureBroadcastActor: fromPromise<ArkadeUnilateralExitProgress, EnsureBroadcastActorInput>(
      async () => {
        throw new Error('ensureBroadcastActor implementation missing')
      },
    ),
    resolveAbortVtxoIdsActor: fromPromise<{ vtxoIds: string[] }, ResolveAbortVtxoIdsActorInput>(
      async () => {
        throw new Error('resolveAbortVtxoIdsActor implementation missing')
      },
    ),
  } satisfies UnilateralExitSetupActors,
  guards: {
    isJobCompleteFromFetchEvent: ({ context, event }) => {
      const output = progressFromFetchEvent(event)
      return isJobCompleteFromProgress(output, context)
    },
    isJobCompleteFromProceedEvent: ({ context, event }) => {
      const output = progressFromProceedEvent(event)
      return isJobCompleteFromProgress(output, context)
    },
    isJobCompleteFromEnsureBroadcastEvent: ({ context, event }) => {
      const output = progressFromEnsureBroadcastEvent(event)
      return isJobCompleteFromProgress(output, context)
    },
    needsBroadcastFromFetchEvent: ({ context, event }) => {
      const output = progressFromFetchEvent(event)
      if (!needsBroadcastEnsurance(output)) {
        return false
      }
      if (context.automationEnabled) {
        return true
      }
      if (!context.proceedRequested || context.feeRateSatPerVb == null) {
        return false
      }
      if (context.proceedTargetStepIndex == null) {
        return true
      }
      return output.stepIndex === context.proceedTargetStepIndex
    },
    needsBroadcastBeforeEnsureBroadcast: ({ context, event }) =>
      needsBroadcastEnsurance(progressFromFetchEvent(event)) &&
      context.automationEnabled &&
      context.feeRateSatPerVb == null,
    isWaitingForRelayedStepConfirmationFromEvent: ({ event }) =>
      isWaitingForRelayedStepConfirmation(progressFromFetchEvent(event)),
    isProgressRefresh: ({ context }) => context.progressRefreshRequested,
    isUnconfirmedParentRetryProgressRefresh: ({ context }) =>
      context.unconfirmedParentRetry != null && context.progressRefreshRequested,
    manualProceedTargetMismatch: ({ context, event }) => {
      const output = progressFromFetchEvent(event)
      return (
        !context.automationEnabled &&
        context.proceedRequested &&
        context.proceedTargetStepIndex != null &&
        output != null &&
        output.stepIndex !== context.proceedTargetStepIndex
      )
    },
    manualFetchStepIndexAdvanced: ({ context, event }) =>
      !context.automationEnabled &&
      !context.proceedRequested &&
      stepIndexAdvancedPastContext(context.progress, progressFromFetchEvent(event)),
    hasActiveManualJob: ({ context }) =>
      !context.automationEnabled &&
      context.jobOutpoints.length > 0 &&
      context.progress != null,
    hasActiveAutomaticJob: ({ context }) =>
      context.automationEnabled &&
      context.pausedReason == null &&
      context.jobOutpoints.length > 0 &&
      context.progress != null &&
      !isJobCompleteFromProgress(context.progress, context),
    shouldWaitAfterEnsureBroadcast: ({ context, event }) => {
      const output = progressFromEnsureBroadcastEvent(event)
      const waitingRelayed = isWaitingForRelayedStepConfirmation(output)
      const advanced = stepIndexAdvancedPastContext(context.progress, output)
      return waitingRelayed && (context.automationEnabled || !advanced)
    },
    shouldContinueAutomationAfterEnsureBroadcast: ({ context, event }) => {
      if (!context.automationEnabled || context.pausedReason != null) {
        return false
      }
      const output = progressFromEnsureBroadcastEvent(event)
      if (isJobCompleteFromProgress(output, context)) {
        return false
      }
      return !isWaitingForRelayedStepConfirmation(output)
    },
    shouldRunAutomationPolicyFromEvent: ({ context, event }) => {
      const output = progressFromFetchEvent(event)
      return (
        context.automationEnabled &&
        context.proceedRequested &&
        context.pausedReason == null &&
        output?.phase === 'idle' &&
        !needsBroadcastEnsurance(output)
      )
    },
    shouldProceedNowFromEvent: ({ context, event }) => {
      const output = progressFromFetchEvent(event)
      return (
        context.proceedRequested &&
        context.feeRateSatPerVb != null &&
        output?.phase === 'idle' &&
        !needsBroadcastEnsurance(output)
      )
    },
    policyPaused: ({ event }) => {
      assertEvent(event, 'xstate.done.actor.evaluateAutomationPolicy')
      return event.output.pausedReason != null
    },
    policyOk: ({ event }) => {
      assertEvent(event, 'xstate.done.actor.evaluateAutomationPolicy')
      return event.output.pausedReason == null
    },
    isJobTerminatedFromViabilityEvent: ({ event }) => {
      assertEvent(event, 'xstate.done.actor.evaluateJobViability')
      return isTerminalViabilityStatus(event.output)
    },
    isUnconfirmedParentPackageError: ({ event }) =>
      isRetryableUnconfirmedParentPackageError(errorFromProceedOrEnsureBroadcast(event)),
    automationEnabled: ({ context }) => context.automationEnabled,
    prefsEnabled: ({ event }) => {
      assertEvent(event, 'AUTOMATION_PREFS_CHANGED')
      return event.automationEnabled
    },
    prefsEnabledWithJob: ({ context, event }) => {
      assertEvent(event, 'AUTOMATION_PREFS_CHANGED')
      return event.automationEnabled && context.jobOutpoints.length > 0
    },
  },
  actions: {
    assignWalletScope: assign(({ event }) => {
      assertEvent(event, 'WALLET_CONFIGURED')
      return {
        walletScope: event.walletScope,
        pollDelayMs: unilateralExitAutomationWaitPollMs(event.walletScope.networkMode),
      }
    }),
    assignStartManual: assign(({ event }) => {
      assertEvent(event, 'START_MANUAL')
      const outpoints = sortArkadeVtxoOutpoints(event.outpoints)
      return {
        walletScope: event.walletScope,
        jobOutpoints: outpoints,
        proceedRequested: true,
        proceedTargetStepIndex: null,
        progressRefreshRequested: false,
        unconfirmedParentRetry: null,
        feeRateSatPerVb: event.feeRateSatPerVb,
        pausedReason: null,
        lastErrorMessage: null,
        progress: null,
      }
    }),
    assignStartAutomatic: assign(({ event }) => {
      assertEvent(event, 'START_AUTOMATIC')
      const outpoints = sortArkadeVtxoOutpoints(event.outpoints)
      return {
        walletScope: event.walletScope,
        jobOutpoints: outpoints,
        automationEnabled: true,
        proceedRequested: true,
        proceedTargetStepIndex: null,
        progressRefreshRequested: false,
        unconfirmedParentRetry: null,
        feeRateSatPerVb: null,
        pausedReason: null,
        lastErrorMessage: null,
        progress: null,
      }
    }),
    assignHydrate: assign(({ context, event }) => {
      assertEvent(event, 'HYDRATE_OR_START')
      const outpoints = sortArkadeVtxoOutpoints(event.outpoints)
      const automationEnabled = event.automationEnabled ?? false
      const resumeAutomation = event.resumeAutomation ?? false
      const keepExistingProgress =
        context.progress != null &&
        arkadeVtxoOutpointListsEqual(context.jobOutpoints, outpoints)
      return {
        walletScope: event.walletScope,
        jobOutpoints: outpoints,
        automationEnabled,
        proceedRequested: resumeAutomation && automationEnabled,
        proceedTargetStepIndex: null,
        progressRefreshRequested: false,
        unconfirmedParentRetry: null,
        ...(automationEnabled ? { feeRateSatPerVb: null } : {}),
        progress: keepExistingProgress ? context.progress : null,
        pausedReason: null,
        lastErrorMessage: null,
        reconcileInProgressSats: event.reconcileInProgressSats ?? 0,
        reconcileInProgressOutpoints: event.reconcileInProgressOutpoints ?? [],
      }
    }),
    persistActiveJobFromContext: ({ context }) => {
      if (context.walletScope == null) {
        return
      }
      persistActiveUnilateralExitJob(context.walletScope, context.jobOutpoints)
    },
    ensurePersistedJobFromContext: ({ context }) => {
      if (context.walletScope == null) {
        return
      }
      ensurePersistedUnilateralExitJob(context.walletScope, context.jobOutpoints)
    },
    assignProceedManual: assign(({ context, event }) => {
      assertEvent(event, 'PROCEED_MANUAL')
      return {
        proceedRequested: true,
        proceedTargetStepIndex: context.progress?.stepIndex ?? null,
        progressRefreshRequested: false,
        feeRateSatPerVb: event.feeRateSatPerVb,
        pausedReason: null,
        lastErrorMessage: null,
      }
    }),
    assignProgressFromFetch: assign(({ context, event }) => {
      assertEvent(event, 'xstate.done.actor.fetchProgress')
      const retry = context.unconfirmedParentRetry
      const output = event.output
      return {
        progress: output,
        unconfirmedParentRetry:
          retry == null || output.stepIndex !== retry.stepIndex ? null : retry,
      }
    }),
    assignProgressFromProceed: assign(({ event }) => {
      assertEvent(event, 'xstate.done.actor.proceedStep')
      return {
        progress: event.output,
        unconfirmedParentRetry: null,
      }
    }),
    assignProgressFromEnsureBroadcast: assign(({ event }) => {
      assertEvent(event, 'xstate.done.actor.ensureBroadcast')
      return {
        progress: event.output,
        unconfirmedParentRetry: null,
      }
    }),
    assignFeeFromPolicy: assign({
      feeRateSatPerVb: ({ event }) => {
        assertEvent(event, 'xstate.done.actor.evaluateAutomationPolicy')
        return event.output.feeRateSatPerVb
      },
    }),
    assignPausedFromPolicy: assign({
      pausedReason: ({ event }) => {
        assertEvent(event, 'xstate.done.actor.evaluateAutomationPolicy')
        return event.output.pausedReason
      },
      proceedRequested: false,
    }),
    assignPausedUnknownPolicy: assign({
      pausedReason: 'error' as const,
      lastErrorMessage: 'Policy check failed.',
      proceedRequested: false,
    }),
    assignAutomationPrefs: assign(({ context, event }) => {
      assertEvent(event, 'AUTOMATION_PREFS_CHANGED')
      return {
        automationEnabled: event.automationEnabled,
        pausedReason: null,
        lastErrorMessage: null,
        feeRateSatPerVb: event.automationEnabled ? null : context.feeRateSatPerVb,
        proceedRequested: event.automationEnabled
          ? context.jobOutpoints.length > 0
          : false,
      }
    }),
    assignResume: assign({
      pausedReason: null,
      lastErrorMessage: null,
      proceedRequested: ({ context }) => context.automationEnabled,
    }),
    resumeAutomationProceed: assign({
      proceedRequested: ({ context }) =>
        context.unconfirmedParentRetry != null ? false : context.automationEnabled,
      proceedTargetStepIndex: ({ context }) => {
        if (context.unconfirmedParentRetry != null) {
          return context.proceedTargetStepIndex
        }
        return context.automationEnabled ? context.proceedTargetStepIndex : null
      },
      progressRefreshRequested: false,
    }),
    assignProceedForUnconfirmedParentRetry: assign({
      proceedRequested: true,
      proceedTargetStepIndex: ({ context }) =>
        context.unconfirmedParentRetry?.stepIndex ??
        context.progress?.stepIndex ??
        null,
    }),
    assignProgressRefresh: assign({
      progressRefreshRequested: true,
      proceedRequested: false,
      proceedTargetStepIndex: null,
    }),
    clearProgressRefresh: assign({
      progressRefreshRequested: false,
    }),
    clearProceedRequested: assign({
      proceedRequested: false,
      proceedTargetStepIndex: null,
      progressRefreshRequested: false,
    }),
    clearJobActorContext: assign(() => ({
      jobOutpoints: [],
      progress: null,
      proceedRequested: false,
      proceedTargetStepIndex: null,
      progressRefreshRequested: false,
      unconfirmedParentRetry: null,
      feeRateSatPerVb: null,
      pausedReason: null,
      lastErrorMessage: null,
      reconcileInProgressSats: 0,
      reconcileInProgressOutpoints: [],
    })),
    clearPersistedJob: ({ context }) => {
      if (context.walletScope != null) {
        clearPersistedUnilateralExitJob(context.walletScope)
      }
    },
    syncPersistedRelayWaitFromFetch: ({ context, event }) => {
      syncPersistedRelayWait(context.walletScope, progressFromFetchEvent(event))
    },
    syncPersistedRelayWaitFromProceed: ({ context, event }) => {
      syncPersistedRelayWait(context.walletScope, progressFromProceedEvent(event))
    },
    syncPersistedRelayWaitFromEnsureBroadcast: ({ context, event }) => {
      syncPersistedRelayWait(
        context.walletScope,
        progressFromEnsureBroadcastEvent(event),
      )
    },
    assignErrorFromProceed: assign(({ context, event }) => {
      assertEvent(event, 'xstate.error.actor.proceedStep')
      return {
        lastErrorMessage: actorErrorMessage(event.error, 'Unroll step failed.'),
        proceedRequested: false,
        progress: rewoundProgressFromPackageError(event.error) ?? context.progress,
      }
    }),
    assignErrorFromEnsureBroadcast: assign(({ context, event }) => {
      assertEvent(event, 'xstate.error.actor.ensureBroadcast')
      return {
        lastErrorMessage: actorErrorMessage(
          event.error,
          'Failed to broadcast unilateral exit step.',
        ),
        proceedRequested: false,
        progress: rewoundProgressFromPackageError(event.error) ?? context.progress,
      }
    }),
    assignUnconfirmedParentRetry: assign({
      lastErrorMessage: null,
      proceedRequested: false,
      progress: ({ event, context }) =>
        rewoundProgressFromPackageError(errorFromProceedOrEnsureBroadcast(event)) ??
        context.progress,
      unconfirmedParentRetry: ({ event, context }) =>
        unconfirmedParentRetryFromProgress(
          rewoundProgressFromPackageError(errorFromProceedOrEnsureBroadcast(event)) ??
            context.progress,
        ),
    }),
    assignErrorFromFetch: assign({
      lastErrorMessage: ({ event }) => {
        assertEvent(event, 'xstate.error.actor.fetchProgress')
        return actorErrorMessage(event.error, 'Failed to load unilateral exit progress.')
      },
    }),
    assignPolicyError: assign({
      pausedReason: 'error' as const,
      lastErrorMessage: ({ event }) => {
        assertEvent(event, 'xstate.error.actor.evaluateAutomationPolicy')
        return actorErrorMessage(event.error, 'Policy check failed.')
      },
      proceedRequested: false,
    }),
    assignAutomationBroadcastFailure: assign({
      pausedReason: 'error' as const,
      proceedRequested: false,
      lastErrorMessage: ({ event }) => {
        assertEvent(event, ['xstate.error.actor.proceedStep', 'xstate.error.actor.ensureBroadcast'])
        return actorErrorMessage(event.error, 'Unroll step failed.')
      },
    }),
    assignErrorFromViability: assign({
      lastErrorMessage: ({ event }) => {
        assertEvent(event, 'xstate.error.actor.evaluateJobViability')
        return actorErrorMessage(
          event.error,
          'Failed to evaluate unilateral exit job viability.',
        )
      },
      proceedRequested: false,
    }),
    persistUnilateralExitFailureFromViability: ({ context, event }) => {
      assertEvent(event, 'xstate.done.actor.evaluateJobViability')
      const viability = event.output
      if (context.walletScope == null || !isTerminalViabilityStatus(viability)) {
        return
      }
      const reasonCode = viability.reasonCode as UnilateralExitFailureReasonCode
      if (reasonCode !== 'asp_swept_targets' && reasonCode !== 'branch_funding_lost') {
        return
      }
      const job = getPersistedUnilateralExitJob(context.walletScope)
      persistUnilateralExitFailureRecord(
        context.walletScope,
        buildPersistedUnilateralExitFailure({
          selectedLeafOutpoints: context.jobOutpoints,
          jobStartedAtUnix: job.jobStartedAtUnix ?? Math.floor(Date.now() / 1000),
          reasonCode,
          detailMessage: viability.detailMessage ?? '',
        }),
      )
    },
    persistAbortedUnilateralExitFailure: ({ context, event }) => {
      assertEvent(event, 'ABORT_ORCHESTRATION')
      if (context.walletScope == null) {
        return
      }
      const job = getPersistedUnilateralExitJob(context.walletScope)
      persistUnilateralExitFailureRecord(
        context.walletScope,
        buildPersistedUnilateralExitFailure({
          selectedLeafOutpoints: context.jobOutpoints,
          jobStartedAtUnix: job.jobStartedAtUnix ?? Math.floor(Date.now() / 1000),
          reasonCode: 'user_aborted',
          detailMessage: '',
          vtxoIds: [],
        }),
      )
    },
    patchAbortedFailureVtxoIds: ({ context, event }) => {
      assertEvent(event, 'xstate.done.actor.resolveAbortVtxoIds')
      if (context.walletScope == null) {
        return
      }
      const existing = getPersistedUnilateralExitFailure(context.walletScope)
      if (existing == null || existing.reasonCode !== 'user_aborted') {
        return
      }
      persistUnilateralExitFailureRecord(context.walletScope, {
        ...existing,
        vtxoIds: event.output.vtxoIds,
      })
    },
    stageAbortedJobOutpoints: assign(({ context, event }) => {
      assertEvent(event, 'ABORT_ORCHESTRATION')
      if (context.jobOutpoints.length > 0 || event.resolvedJobOutpoints.length === 0) {
        return {}
      }
      return {
        jobOutpoints: sortArkadeVtxoOutpoints(event.resolvedJobOutpoints),
      }
    }),
    invalidateUnilateralExitQueriesOnTerminate: ({ context }) => {
      if (context.walletScope == null || context.jobOutpoints.length === 0) {
        return
      }
      void invalidateUnilateralExitQueries(context.walletScope, context.jobOutpoints)
    },
    clearTerminatedProceedRequested: assign({
      proceedRequested: false,
    }),
    resetToNotConfigured: assign(() => createInitialUnilateralExitContext()),
  },
})
