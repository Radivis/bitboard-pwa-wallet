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
  type UnilateralExitMachineEvent,
  type UnilateralExitMachineInput,
  type UnilateralExitPolicyEvaluation,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import type { ArkadeUnilateralExitProgress, ArkadeUnilateralExitJobViability } from '@/workers/arkade-api'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'
import { assign, fromPromise, setup } from 'xstate'

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

function viabilityFromEvaluateEvent(
  event: UnilateralExitMachineEvent,
): ArkadeUnilateralExitJobViability | null {
  return event.type === 'xstate.done.actor.evaluateJobViability' ? event.output : null
}

function isTerminalViabilityStatus(
  viability: ArkadeUnilateralExitJobViability | null,
): boolean {
  return viability?.status === 'aspSweptTargets' || viability?.status === 'branchFundingLost'
}

function progressFromFetchEvent(
  event: UnilateralExitMachineEvent,
): ArkadeUnilateralExitProgress | null {
  return event.type === 'xstate.done.actor.fetchProgress' ? event.output : null
}

function progressFromEnsureBroadcastEvent(
  event: UnilateralExitMachineEvent,
): ArkadeUnilateralExitProgress | null {
  return event.type === 'xstate.done.actor.ensureBroadcast' ? event.output : null
}

function errorFromProceedOrEnsureBroadcast(
  event: UnilateralExitMachineEvent,
): unknown {
  if (
    event.type === 'xstate.error.actor.ensureBroadcast' ||
    event.type === 'xstate.error.actor.proceedStep'
  ) {
    return event.error
  }
  return undefined
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
    events: {} as UnilateralExitMachineEvent,
    input: {} as UnilateralExitMachineInput,
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
  },
  guards: {
    isJobCompleteFromFetchEvent: ({ context, event }) => {
      const output = progressFromFetchEvent(event)
      return isJobCompleteFromProgress(output, context)
    },
    isJobCompleteFromProceedEvent: ({ context, event }) => {
      const output =
        event.type === 'xstate.done.actor.proceedStep' ? event.output : null
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
      return output?.stepIndex === context.proceedTargetStepIndex
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
      if (output == null || isJobCompleteFromProgress(output, context)) {
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
    policyPaused: ({ event }) =>
      event.type === 'xstate.done.actor.evaluateAutomationPolicy' &&
      event.output.pausedReason != null,
    policyOk: ({ event }) =>
      event.type === 'xstate.done.actor.evaluateAutomationPolicy' &&
      event.output.pausedReason == null,
    isJobTerminatedFromViabilityEvent: ({ event }) =>
      isTerminalViabilityStatus(viabilityFromEvaluateEvent(event)),
    isUnconfirmedParentPackageError: ({ event }) =>
      isRetryableUnconfirmedParentPackageError(errorFromProceedOrEnsureBroadcast(event)),
  },
  actions: {
    assignWalletScope: assign(({ event }) => {
      if (event.type !== 'WALLET_CONFIGURED') {
        return {}
      }
      return {
        walletScope: event.walletScope,
        pollDelayMs: unilateralExitAutomationWaitPollMs(event.walletScope.networkMode),
      }
    }),
    assignStartManual: assign(({ event }) => {
      if (event.type !== 'START_MANUAL') {
        return {}
      }
      const outpoints = sortArkadeVtxoOutpoints(event.outpoints)
      persistActiveUnilateralExitJob(event.walletScope, outpoints)
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
      if (event.type !== 'START_AUTOMATIC') {
        return {}
      }
      const outpoints = sortArkadeVtxoOutpoints(event.outpoints)
      persistActiveUnilateralExitJob(event.walletScope, outpoints)
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
    assignHydrate: assign(({ event }) => {
      if (event.type !== 'HYDRATE_OR_START') {
        return {}
      }
      const outpoints = sortArkadeVtxoOutpoints(event.outpoints)
      ensurePersistedUnilateralExitJob(event.walletScope, outpoints)
      const automationEnabled = event.automationEnabled ?? false
      const resumeAutomation = event.resumeAutomation ?? false
      return {
        walletScope: event.walletScope,
        jobOutpoints: outpoints,
        automationEnabled,
        proceedRequested: resumeAutomation && automationEnabled,
        proceedTargetStepIndex: null,
        progressRefreshRequested: false,
        unconfirmedParentRetry: null,
        ...(automationEnabled ? { feeRateSatPerVb: null } : {}),
        progress: null,
        pausedReason: null,
        lastErrorMessage: null,
        reconcileInProgressSats: event.reconcileInProgressSats ?? 0,
        reconcileInProgressOutpoints: event.reconcileInProgressOutpoints ?? [],
      }
    }),
    assignProceedManual: assign(({ context, event }) => {
      if (event.type !== 'PROCEED_MANUAL') {
        return {}
      }
      return {
        proceedRequested: true,
        proceedTargetStepIndex: context.progress?.stepIndex ?? null,
        progressRefreshRequested: false,
        feeRateSatPerVb: event.feeRateSatPerVb,
        pausedReason: null,
        lastErrorMessage: null,
      }
    }),
    assignProgressFromFetch: assign({
      progress: ({ event }) =>
        event.type === 'xstate.done.actor.fetchProgress' ? event.output : null,
      unconfirmedParentRetry: ({ event, context }) => {
        const retry = context.unconfirmedParentRetry
        if (retry == null) {
          return null
        }
        const output =
          event.type === 'xstate.done.actor.fetchProgress' ? event.output : null
        if (output != null && output.stepIndex !== retry.stepIndex) {
          return null
        }
        return retry
      },
    }),
    assignProgressFromProceed: assign({
      progress: ({ event }) =>
        event.type === 'xstate.done.actor.proceedStep' ? event.output : null,
      unconfirmedParentRetry: null,
    }),
    assignProgressFromEnsureBroadcast: assign({
      progress: ({ event }) =>
        event.type === 'xstate.done.actor.ensureBroadcast' ? event.output : null,
      unconfirmedParentRetry: null,
    }),
    assignFeeFromPolicy: assign({
      feeRateSatPerVb: ({ event }) =>
        event.type === 'xstate.done.actor.evaluateAutomationPolicy'
          ? event.output.feeRateSatPerVb
          : null,
    }),
    assignPausedFromPolicy: assign({
      pausedReason: ({ event }) =>
        event.type === 'xstate.done.actor.evaluateAutomationPolicy'
          ? event.output.pausedReason
          : null,
      proceedRequested: false,
    }),
    assignAutomationPrefs: assign({
      automationEnabled: ({ event }) =>
        event.type === 'AUTOMATION_PREFS_CHANGED' ? event.automationEnabled : false,
      pausedReason: null,
      lastErrorMessage: null,
      feeRateSatPerVb: ({ context, event }) => {
        if (event.type === 'AUTOMATION_PREFS_CHANGED' && event.automationEnabled) {
          return null
        }
        return context.feeRateSatPerVb
      },
      proceedRequested: ({ context, event }) => {
        if (event.type !== 'AUTOMATION_PREFS_CHANGED') {
          return context.proceedRequested
        }
        if (!event.automationEnabled) {
          return false
        }
        return context.jobOutpoints.length > 0
      },
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
      const progress =
        event.type === 'xstate.done.actor.proceedStep' ? event.output : null
      syncPersistedRelayWait(context.walletScope, progress)
    },
    syncPersistedRelayWaitFromEnsureBroadcast: ({ context, event }) => {
      syncPersistedRelayWait(
        context.walletScope,
        progressFromEnsureBroadcastEvent(event),
      )
    },
    clearPersistedOnComplete: ({ context }) => {
      if (context.walletScope != null) {
        clearPersistedUnilateralExitJob(context.walletScope)
      }
    },
    assignErrorFromProceed: assign({
      lastErrorMessage: ({ event }) =>
        event.type === 'xstate.error.actor.proceedStep'
          ? event.error instanceof Error
            ? event.error.message
            : 'Unroll step failed.'
          : null,
      proceedRequested: false,
      progress: ({ event, context }) =>
        event.type === 'xstate.error.actor.proceedStep'
          ? (rewoundProgressFromPackageError(event.error) ?? context.progress)
          : context.progress,
    }),
    assignErrorFromEnsureBroadcast: assign({
      lastErrorMessage: ({ event }) =>
        event.type === 'xstate.error.actor.ensureBroadcast'
          ? event.error instanceof Error
            ? event.error.message
            : 'Failed to broadcast unilateral exit step.'
          : null,
      proceedRequested: false,
      progress: ({ event, context }) =>
        event.type === 'xstate.error.actor.ensureBroadcast'
          ? (rewoundProgressFromPackageError(event.error) ?? context.progress)
          : context.progress,
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
      lastErrorMessage: ({ event }) =>
        event.type === 'xstate.error.actor.fetchProgress'
          ? event.error instanceof Error
            ? event.error.message
            : 'Failed to load unilateral exit progress.'
          : null,
    }),
    assignPolicyError: assign({
      pausedReason: 'error' as const,
      lastErrorMessage: ({ event }) =>
        event.type === 'xstate.error.actor.evaluateAutomationPolicy'
          ? event.error instanceof Error
            ? event.error.message
            : 'Policy check failed.'
          : null,
      proceedRequested: false,
    }),
    assignAutomationBroadcastFailure: assign({
      pausedReason: 'error' as const,
      proceedRequested: false,
      lastErrorMessage: ({ event }) =>
        event.type === 'xstate.error.actor.proceedStep' ||
        event.type === 'xstate.error.actor.ensureBroadcast'
          ? event.error instanceof Error
            ? event.error.message
            : 'Unroll step failed.'
          : null,
    }),
    assignErrorFromViability: assign({
      lastErrorMessage: ({ event }) =>
        event.type === 'xstate.error.actor.evaluateJobViability'
          ? event.error instanceof Error
            ? event.error.message
            : 'Failed to evaluate unilateral exit job viability.'
          : null,
      proceedRequested: false,
    }),
    persistUnilateralExitFailureFromViability: ({ context, event }) => {
      const viability = viabilityFromEvaluateEvent(event)
      if (context.walletScope == null || viability == null || !isTerminalViabilityStatus(viability)) {
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
      if (context.walletScope == null || event.type !== 'ABORT_ORCHESTRATION') {
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
      if (
        context.walletScope == null ||
        event.type !== 'xstate.done.actor.resolveAbortVtxoIds'
      ) {
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
      if (event.type !== 'ABORT_ORCHESTRATION' || context.jobOutpoints.length > 0) {
        return {}
      }
      if (event.resolvedJobOutpoints.length === 0) {
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
      void import('@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.actors').then(
        (module) =>
          module.invalidateUnilateralExitQueries(
            context.walletScope!,
            context.jobOutpoints,
          ),
      )
    },
    clearTerminatedProceedRequested: assign({
      proceedRequested: false,
    }),
    resetToNotConfigured: assign(() => createInitialUnilateralExitContext()),
  },
})
