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
  getPersistedUnilateralExitJob,
  persistActiveUnilateralExitJob,
  updatePersistedUnilateralExitRelayWait,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import {
  buildPersistedUnilateralExitFailure,
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
    isWaitingForRelayedStepConfirmationFromEnsureBroadcastEvent: ({ event }) =>
      isWaitingForRelayedStepConfirmation(progressFromEnsureBroadcastEvent(event)),
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
    shouldWaitAfterEnsureBroadcast: ({ context, event }) => {
      const output = progressFromEnsureBroadcastEvent(event)
      const waitingRelayed = isWaitingForRelayedStepConfirmation(output)
      const advanced = stepIndexAdvancedPastContext(context.progress, output)
      return waitingRelayed && (context.automationEnabled || !advanced)
    },
    isWaitingForRelayedStepConfirmation: ({ context }) =>
      isWaitingForRelayedStepConfirmation(context.progress),
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
    shouldRunAutomationPolicy: ({ context }) =>
      context.automationEnabled &&
      context.proceedRequested &&
      context.pausedReason == null &&
      context.progress?.phase === 'idle' &&
      !needsBroadcastEnsurance(context.progress),
    shouldProceedNow: ({ context }) =>
      context.proceedRequested &&
      context.feeRateSatPerVb != null &&
      context.progress?.phase === 'idle' &&
      !needsBroadcastEnsurance(context.progress),
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
        unconfirmedParentRetry: null,
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
      persistActiveUnilateralExitJob(event.walletScope, outpoints)
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
    assignProgress: assign({
      progress: (_, params: { progress: ArkadeUnilateralExitProgress }) => params.progress,
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
          vtxoIds: event.vtxoIds,
        }),
      )
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

const checkingProgressOnDone = [
  {
    guard: 'isJobCompleteFromFetchEvent',
    target: 'complete',
    actions: [
      'assignProgressFromFetch',
      'syncPersistedRelayWaitFromFetch',
      'clearPersistedOnComplete',
    ],
  },
  {
    guard: 'isUnconfirmedParentRetryProgressRefresh',
    target: 'waitingForParentData',
    actions: [
      'assignProgressFromFetch',
      'syncPersistedRelayWaitFromFetch',
      'clearProgressRefresh',
    ],
  },
  {
    guard: 'isProgressRefresh',
    target: 'idle',
    actions: [
      'assignProgressFromFetch',
      'syncPersistedRelayWaitFromFetch',
      'clearProgressRefresh',
    ],
  },
  {
    guard: 'manualProceedTargetMismatch',
    target: 'idle',
    actions: [
      'assignProgressFromFetch',
      'syncPersistedRelayWaitFromFetch',
      'clearProceedRequested',
    ],
  },
  {
    guard: 'needsBroadcastBeforeEnsureBroadcast',
    target: 'evaluatingPolicy',
    actions: ['assignProgressFromFetch', 'syncPersistedRelayWaitFromFetch'],
  },
  {
    guard: 'needsBroadcastFromFetchEvent',
    target: 'ensuringBroadcast',
    actions: ['assignProgressFromFetch', 'syncPersistedRelayWaitFromFetch'],
  },
  {
    guard: 'manualFetchStepIndexAdvanced',
    target: 'idle',
    actions: [
      'assignProgressFromFetch',
      'syncPersistedRelayWaitFromFetch',
      'clearProceedRequested',
    ],
  },
  {
    guard: 'isWaitingForRelayedStepConfirmationFromEvent',
    target: 'waitingConfirm',
    actions: [
      'assignProgressFromFetch',
      'syncPersistedRelayWaitFromFetch',
      'clearProceedRequested',
    ],
  },
  {
    guard: 'shouldRunAutomationPolicyFromEvent',
    target: 'evaluatingPolicy',
    actions: ['assignProgressFromFetch', 'syncPersistedRelayWaitFromFetch'],
  },
  {
    guard: 'shouldProceedNowFromEvent',
    target: 'proceeding',
    actions: ['assignProgressFromFetch', 'syncPersistedRelayWaitFromFetch'],
  },
  {
    target: 'idle',
    actions: ['assignProgressFromFetch', 'syncPersistedRelayWaitFromFetch'],
  },
] as const

const ensuringBroadcastOnDone = [
  {
    guard: 'isJobCompleteFromEnsureBroadcastEvent',
    target: 'complete',
    actions: [
      'assignProgressFromEnsureBroadcast',
      'syncPersistedRelayWaitFromEnsureBroadcast',
      'clearPersistedOnComplete',
    ],
  },
  {
    guard: 'shouldWaitAfterEnsureBroadcast',
    target: 'waitingConfirm',
    actions: [
      'assignProgressFromEnsureBroadcast',
      'syncPersistedRelayWaitFromEnsureBroadcast',
      'clearProceedRequested',
    ],
  },
  {
    target: 'idle',
    actions: [
      'assignProgressFromEnsureBroadcast',
      'syncPersistedRelayWaitFromEnsureBroadcast',
      'clearProceedRequested',
    ],
  },
] as const

const abortOrchestrationTransition = { target: 'aborted' } as const

export const unilateralExitMachine = unilateralExitMachineSetup.createMachine({
  id: 'unilateralExit',
  context: ({ input }) => createInitialUnilateralExitContext(input),
  initial: 'notConfigured',
  on: {
    WALLET_RESET: {
      target: '.notConfigured',
      actions: 'resetToNotConfigured',
    },
  },
  states: {
    notConfigured: {
      on: {
        WALLET_CONFIGURED: {
          target: 'idle',
          actions: 'assignWalletScope',
        },
      },
    },
    idle: {
      after: {
        pollDelay: {
          guard: 'hasActiveManualJob',
          target: 'checkingProgress',
          actions: 'assignProgressRefresh',
        },
      },
      on: {
        START_MANUAL: {
          target: 'checkingProgress',
          actions: 'assignStartManual',
        },
        START_AUTOMATIC: {
          target: 'checkingProgress',
          actions: 'assignStartAutomatic',
        },
        HYDRATE_OR_START: {
          target: 'checkingProgress',
          actions: 'assignHydrate',
        },
        PROCEED_MANUAL: {
          target: 'checkingProgress',
          actions: 'assignProceedManual',
        },
        POLL_TICK: {
          guard: 'hasActiveManualJob',
          target: 'checkingProgress',
          actions: 'assignProgressRefresh',
        },
        ABORT_ORCHESTRATION: abortOrchestrationTransition,
        CLEAR_JOB: {
          actions: ['clearPersistedJob', 'clearJobActorContext'],
        },
        AUTOMATION_PREFS_CHANGED: [
          {
            guard: ({ context, event }) =>
              event.type === 'AUTOMATION_PREFS_CHANGED' &&
              event.automationEnabled &&
              context.jobOutpoints.length > 0,
            target: 'checkingProgress',
            actions: 'assignAutomationPrefs',
          },
          {
            actions: 'assignAutomationPrefs',
          },
        ],
      },
    },
    checkingProgress: {
      on: {
        ABORT_ORCHESTRATION: abortOrchestrationTransition,
        PROCEED_MANUAL: {
          actions: 'assignProceedManual',
        },
        AUTOMATION_PREFS_CHANGED: {
          actions: 'assignAutomationPrefs',
        },
      },
      invoke: {
        id: 'evaluateJobViability',
        src: 'evaluateJobViabilityActor',
        input: ({ context }) => ({ outpoints: context.jobOutpoints }),
        onDone: [
          {
            guard: 'isJobTerminatedFromViabilityEvent',
            target: 'terminated',
          },
          {
            target: 'loadingProgress',
          },
        ],
        onError: {
          target: 'error',
          actions: 'assignErrorFromViability',
        },
      },
    },
    loadingProgress: {
      on: {
        ABORT_ORCHESTRATION: abortOrchestrationTransition,
        PROCEED_MANUAL: {
          actions: 'assignProceedManual',
        },
        AUTOMATION_PREFS_CHANGED: {
          actions: 'assignAutomationPrefs',
        },
      },
      invoke: {
        id: 'fetchProgress',
        src: 'fetchProgressActor',
        input: ({ context }) => ({ outpoints: context.jobOutpoints }),
        onDone: checkingProgressOnDone,
        onError: {
          target: 'error',
          actions: 'assignErrorFromFetch',
        },
      },
    },
    evaluatingPolicy: {
      on: {
        ABORT_ORCHESTRATION: abortOrchestrationTransition,
        AUTOMATION_PREFS_CHANGED: {
          actions: 'assignAutomationPrefs',
        },
      },
      invoke: {
        id: 'evaluateAutomationPolicy',
        src: 'evaluateAutomationPolicyActor',
        input: ({ context }) => ({
          walletScope: context.walletScope!,
          outpoints: context.jobOutpoints,
        }),
        onDone: [
          {
            guard: 'policyPaused',
            target: 'paused',
            actions: 'assignPausedFromPolicy',
          },
          {
            guard: 'policyOk',
            target: 'proceeding',
            actions: 'assignFeeFromPolicy',
          },
        ],
        onError: {
          target: 'paused',
          actions: 'assignPolicyError',
        },
      },
    },
    proceeding: {
      on: {
        ABORT_ORCHESTRATION: abortOrchestrationTransition,
        AUTOMATION_PREFS_CHANGED: {
          actions: 'assignAutomationPrefs',
        },
      },
      invoke: {
        id: 'proceedStep',
        src: 'proceedStepActor',
        input: ({ context }) => ({
          walletScope: context.walletScope!,
          outpoints: context.jobOutpoints,
          feeRateSatPerVb: context.feeRateSatPerVb!,
        }),
        onDone: [
          {
            guard: 'isJobCompleteFromProceedEvent',
            target: 'complete',
            actions: [
              'assignProgressFromProceed',
              'syncPersistedRelayWaitFromProceed',
              'clearPersistedOnComplete',
            ],
          },
          {
            target: 'ensuringBroadcast',
            actions: [
              'assignProgressFromProceed',
              'syncPersistedRelayWaitFromProceed',
            ],
          },
        ],
        onError: [
          {
            guard: 'isUnconfirmedParentPackageError',
            target: 'waitingForParentData',
            actions: 'assignUnconfirmedParentRetry',
          },
          {
            guard: ({ context }) => context.automationEnabled,
            target: 'paused',
            actions: 'assignAutomationBroadcastFailure',
          },
          {
            target: 'error',
            actions: 'assignErrorFromProceed',
          },
        ],
      },
    },
    ensuringBroadcast: {
      on: {
        ABORT_ORCHESTRATION: abortOrchestrationTransition,
        AUTOMATION_PREFS_CHANGED: {
          actions: 'assignAutomationPrefs',
        },
      },
      invoke: {
        id: 'ensureBroadcast',
        src: 'ensureBroadcastActor',
        input: ({ context }) => ({
          walletScope: context.walletScope!,
          outpoints: context.jobOutpoints,
          feeRateSatPerVb: context.feeRateSatPerVb,
          automationEnabled: context.automationEnabled,
        }),
        onDone: ensuringBroadcastOnDone,
        onError: [
          {
            guard: 'isUnconfirmedParentPackageError',
            target: 'waitingForParentData',
            actions: 'assignUnconfirmedParentRetry',
          },
          {
            guard: ({ context }) => context.automationEnabled,
            target: 'paused',
            actions: 'assignAutomationBroadcastFailure',
          },
          {
            target: 'error',
            actions: 'assignErrorFromEnsureBroadcast',
          },
        ],
      },
    },
    waitingConfirm: {
      after: {
        pollDelay: {
          target: 'checkingProgress',
          actions: 'resumeAutomationProceed',
        },
      },
      on: {
        ABORT_ORCHESTRATION: abortOrchestrationTransition,
        POLL_TICK: {
          target: 'checkingProgress',
          actions: 'resumeAutomationProceed',
        },
        PROCEED_MANUAL: {
          target: 'checkingProgress',
          actions: 'assignProceedManual',
        },
        RESUME: {
          target: 'checkingProgress',
          actions: 'assignResume',
        },
        AUTOMATION_PREFS_CHANGED: [
          {
            guard: ({ event }) =>
              event.type === 'AUTOMATION_PREFS_CHANGED' && event.automationEnabled,
            target: 'checkingProgress',
            actions: 'assignAutomationPrefs',
          },
          {
            actions: 'assignAutomationPrefs',
          },
        ],
        CLEAR_JOB: {
          target: 'idle',
          actions: ['clearPersistedJob', 'clearJobActorContext'],
        },
      },
    },
    waitingForParentData: {
      after: {
        parentDataWait: [
          {
            guard: ({ context }) => context.automationEnabled,
            target: 'checkingProgress',
            actions: 'assignProceedForUnconfirmedParentRetry',
          },
          {
            target: 'checkingProgress',
            actions: 'assignProgressRefresh',
          },
        ],
      },
      on: {
        ABORT_ORCHESTRATION: abortOrchestrationTransition,
        POLL_TICK: [
          {
            guard: ({ context }) => context.automationEnabled,
            target: 'checkingProgress',
            actions: 'assignProceedForUnconfirmedParentRetry',
          },
          {
            target: 'checkingProgress',
            actions: 'assignProgressRefresh',
          },
        ],
        PROCEED_MANUAL: {
          target: 'checkingProgress',
          actions: 'assignProceedManual',
        },
        AUTOMATION_PREFS_CHANGED: {
          actions: 'assignAutomationPrefs',
        },
        CLEAR_JOB: {
          target: 'idle',
          actions: ['clearPersistedJob', 'clearJobActorContext'],
        },
      },
    },
    paused: {
      on: {
        ABORT_ORCHESTRATION: abortOrchestrationTransition,
        RESUME: {
          target: 'checkingProgress',
          actions: 'assignResume',
        },
        AUTOMATION_PREFS_CHANGED: [
          {
            guard: ({ event }) =>
              event.type === 'AUTOMATION_PREFS_CHANGED' && event.automationEnabled,
            target: 'checkingProgress',
            actions: 'assignAutomationPrefs',
          },
          {
            target: 'idle',
            actions: 'assignAutomationPrefs',
          },
        ],
        CLEAR_JOB: {
          target: 'idle',
          actions: ['clearPersistedJob', 'clearJobActorContext'],
        },
        PROCEED_MANUAL: {
          target: 'checkingProgress',
          actions: 'assignProceedManual',
        },
      },
    },
    complete: {
      on: {
        START_MANUAL: {
          target: 'checkingProgress',
          actions: 'assignStartManual',
        },
        START_AUTOMATIC: {
          target: 'checkingProgress',
          actions: 'assignStartAutomatic',
        },
        CLEAR_JOB: {
          target: 'idle',
          actions: ['clearPersistedJob', 'clearJobActorContext'],
        },
        HYDRATE_OR_START: {
          target: 'checkingProgress',
          actions: 'assignHydrate',
        },
      },
    },
    terminated: {
      entry: [
        'persistUnilateralExitFailureFromViability',
        'invalidateUnilateralExitQueriesOnTerminate',
        'clearPersistedJob',
        'clearJobActorContext',
        'clearTerminatedProceedRequested',
      ],
      always: {
        target: 'idle',
      },
    },
    aborted: {
      entry: [
        'stageAbortedJobOutpoints',
        'persistAbortedUnilateralExitFailure',
        'invalidateUnilateralExitQueriesOnTerminate',
        'clearPersistedJob',
        'clearJobActorContext',
        'clearTerminatedProceedRequested',
      ],
      always: {
        target: 'idle',
      },
    },
    error: {
      on: {
        ABORT_ORCHESTRATION: abortOrchestrationTransition,
        CLEAR_JOB: {
          target: 'idle',
          actions: ['clearPersistedJob', 'clearJobActorContext'],
        },
        PROCEED_MANUAL: {
          target: 'checkingProgress',
          actions: 'assignProceedManual',
        },
        RESUME: {
          target: 'checkingProgress',
          actions: 'assignResume',
        },
      },
    },
  },
})
