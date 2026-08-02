import { isUnilateralExitBranchComplete } from '@/lib/arkade/unilateral-exit-branch-complete'
import {
  isWaitingForRelayedStepConfirmation,
  needsBroadcastEnsurance,
} from '@/lib/arkade/unilateral-exit-broadcast'
import { unilateralExitAutomationWaitPollMs } from '@/lib/arkade/arkade-query-timings'
import {
  clearPersistedUnilateralExitJob,
  persistActiveUnilateralExitJob,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import {
  createInitialUnilateralExitContext,
  type UnilateralExitMachineContext,
  type UnilateralExitMachineEvent,
  type UnilateralExitMachineInput,
  type UnilateralExitPolicyEvaluation,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import type { ArkadeUnilateralExitProgress } from '@/workers/arkade-api'
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

export type ProceedStepActorInput = {
  walletScope: NonNullable<UnilateralExitMachineContext['walletScope']>
  outpoints: UnilateralExitMachineContext['jobOutpoints']
  feeRateSatPerVb: number
}

export type EvaluateAutomationPolicyActorInput = {
  walletScope: NonNullable<UnilateralExitMachineContext['walletScope']>
  outpoints: UnilateralExitMachineContext['jobOutpoints']
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

export const unilateralExitMachineSetup = setup({
  types: {
    context: {} as UnilateralExitMachineContext,
    events: {} as UnilateralExitMachineEvent,
    input: {} as UnilateralExitMachineInput,
  },
  delays: {
    pollDelay: ({ context }) => context.pollDelayMs,
  },
  actors: {
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
    isBranchCompleteFromFetchEvent: ({ event }) => {
      const output = progressFromFetchEvent(event)
      return output != null && isUnilateralExitBranchComplete(output)
    },
    isBranchCompleteFromProceedEvent: ({ event }) => {
      const output =
        event.type === 'xstate.done.actor.proceedStep' ? event.output : null
      return output != null && isUnilateralExitBranchComplete(output)
    },
    isBranchCompleteFromEnsureBroadcastEvent: ({ event }) => {
      const output = progressFromEnsureBroadcastEvent(event)
      return output != null && isUnilateralExitBranchComplete(output)
    },
    needsBroadcastFromFetchEvent: ({ event }) =>
      needsBroadcastEnsurance(progressFromFetchEvent(event)),
    needsBroadcastBeforeEnsureBroadcast: ({ context, event }) =>
      needsBroadcastEnsurance(progressFromFetchEvent(event)) &&
      context.automationEnabled &&
      context.feeRateSatPerVb == null,
    isWaitingForRelayedStepConfirmationFromEvent: ({ event }) =>
      isWaitingForRelayedStepConfirmation(progressFromFetchEvent(event)),
    isWaitingForRelayedStepConfirmationFromEnsureBroadcastEvent: ({ event }) =>
      isWaitingForRelayedStepConfirmation(progressFromEnsureBroadcastEvent(event)),
    isWaitingForRelayedStepConfirmation: ({ context }) =>
      isWaitingForRelayedStepConfirmation(context.progress),
    shouldRunAutomationPolicyFromEvent: ({ context, event }) => {
      const output = progressFromFetchEvent(event)
      return (
        context.automationEnabled &&
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
    assignRestorePersistedJob: assign(({ event }) => {
      if (event.type !== 'RESTORE_PERSISTED_JOB') {
        return {}
      }
      return {
        walletScope: event.walletScope,
        jobOutpoints: sortArkadeVtxoOutpoints(event.outpoints),
        progress: null,
        pausedReason: null,
        lastErrorMessage: null,
        proceedRequested: false,
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
      const automationEnabled = event.automationEnabled ?? false
      return {
        walletScope: event.walletScope,
        jobOutpoints: outpoints,
        automationEnabled,
        proceedRequested: automationEnabled,
        progress: null,
        pausedReason: null,
        lastErrorMessage: null,
      }
    }),
    assignProceedManual: assign(({ event }) => {
      if (event.type !== 'PROCEED_MANUAL') {
        return {}
      }
      return {
        proceedRequested: true,
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
    }),
    assignProgressFromProceed: assign({
      progress: ({ event }) =>
        event.type === 'xstate.done.actor.proceedStep' ? event.output : null,
    }),
    assignProgressFromEnsureBroadcast: assign({
      progress: ({ event }) =>
        event.type === 'xstate.done.actor.ensureBroadcast' ? event.output : null,
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
      proceedRequested: ({ context, event }) =>
        event.type === 'AUTOMATION_PREFS_CHANGED' &&
        event.automationEnabled &&
        context.jobOutpoints.length > 0,
    }),
    assignResume: assign({
      pausedReason: null,
      lastErrorMessage: null,
      proceedRequested: ({ context }) => context.automationEnabled,
    }),
    clearJobContext: assign(({ context }) => {
      if (context.walletScope != null) {
        clearPersistedUnilateralExitJob(context.walletScope)
      }
      return {
        jobOutpoints: [],
        progress: null,
        proceedRequested: false,
        feeRateSatPerVb: null,
        pausedReason: null,
        lastErrorMessage: null,
      }
    }),
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
    }),
    assignErrorFromEnsureBroadcast: assign({
      lastErrorMessage: ({ event }) =>
        event.type === 'xstate.error.actor.ensureBroadcast'
          ? event.error instanceof Error
            ? event.error.message
            : 'Failed to broadcast unilateral exit step.'
          : null,
      proceedRequested: false,
    }),
    assignErrorFromFetch: assign({
      lastErrorMessage: ({ event }) =>
        event.type === 'xstate.error.actor.fetchProgress'
          ? event.error instanceof Error
            ? event.error.message
            : 'Failed to load unilateral exit progress.'
          : null,
    }),
    resetToNotConfigured: assign(() => createInitialUnilateralExitContext()),
  },
})

const resumeAutomationProceed = assign({
  proceedRequested: ({ context }) => context.automationEnabled,
})

const checkingProgressOnDone = [
  {
    guard: 'isBranchCompleteFromFetchEvent',
    target: 'complete',
    actions: ['assignProgressFromFetch', 'clearPersistedOnComplete'],
  },
  {
    guard: 'needsBroadcastBeforeEnsureBroadcast',
    target: 'evaluatingPolicy',
    actions: 'assignProgressFromFetch',
  },
  {
    guard: 'needsBroadcastFromFetchEvent',
    target: 'ensuringBroadcast',
    actions: 'assignProgressFromFetch',
  },
  {
    guard: 'isWaitingForRelayedStepConfirmationFromEvent',
    target: 'waitingConfirm',
    actions: 'assignProgressFromFetch',
  },
  {
    guard: 'shouldRunAutomationPolicyFromEvent',
    target: 'evaluatingPolicy',
    actions: 'assignProgressFromFetch',
  },
  {
    guard: 'shouldProceedNowFromEvent',
    target: 'proceeding',
    actions: 'assignProgressFromFetch',
  },
  {
    target: 'idle',
    actions: 'assignProgressFromFetch',
  },
] as const

const ensuringBroadcastOnDone = [
  {
    guard: 'isBranchCompleteFromEnsureBroadcastEvent',
    target: 'complete',
    actions: ['assignProgressFromEnsureBroadcast', 'clearPersistedOnComplete'],
  },
  {
    guard: 'isWaitingForRelayedStepConfirmationFromEnsureBroadcastEvent',
    target: 'waitingConfirm',
    actions: assign({
      progress: ({ event }) =>
        event.type === 'xstate.done.actor.ensureBroadcast' ? event.output : null,
      proceedRequested: false,
    }),
  },
  {
    target: 'checkingProgress',
    actions: assign({
      progress: ({ event }) =>
        event.type === 'xstate.done.actor.ensureBroadcast' ? event.output : null,
      proceedRequested: false,
    }),
  },
] as const

const automationBroadcastFailureActions = assign({
  pausedReason: 'error' as const,
  proceedRequested: false,
  lastErrorMessage: ({ event }) =>
    event.type === 'xstate.error.actor.proceedStep' ||
    event.type === 'xstate.error.actor.ensureBroadcast'
      ? event.error instanceof Error
        ? event.error.message
        : 'Unroll step failed.'
      : null,
})

export const unilateralExitMachine = unilateralExitMachineSetup.createMachine({
  id: 'unilateralExit',
  context: ({ input }) => createInitialUnilateralExitContext(input),
  initial: 'notConfigured',
  states: {
    notConfigured: {
      on: {
        WALLET_CONFIGURED: {
          target: 'idle',
          actions: 'assignWalletScope',
        },
        WALLET_RESET: {
          actions: 'resetToNotConfigured',
        },
      },
    },
    idle: {
      on: {
        RESTORE_PERSISTED_JOB: {
          actions: 'assignRestorePersistedJob',
        },
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
        CLEAR_JOB: {
          actions: 'clearJobContext',
        },
        WALLET_RESET: {
          target: 'notConfigured',
          actions: 'resetToNotConfigured',
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
          actions: assign({
            pausedReason: 'error' as const,
            lastErrorMessage: ({ event }) =>
              event.error instanceof Error ? event.error.message : 'Policy check failed.',
            proceedRequested: false,
          }),
        },
      },
    },
    proceeding: {
      on: {
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
            guard: 'isBranchCompleteFromProceedEvent',
            target: 'complete',
            actions: ['assignProgressFromProceed', 'clearPersistedOnComplete'],
          },
          {
            target: 'ensuringBroadcast',
            actions: 'assignProgressFromProceed',
          },
        ],
        onError: [
          {
            guard: ({ context }) => context.automationEnabled,
            target: 'paused',
            actions: automationBroadcastFailureActions,
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
            guard: ({ context }) => context.automationEnabled,
            target: 'paused',
            actions: automationBroadcastFailureActions,
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
          actions: resumeAutomationProceed,
        },
      },
      on: {
        POLL_TICK: {
          target: 'checkingProgress',
          actions: resumeAutomationProceed,
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
          actions: 'clearJobContext',
        },
      },
    },
    paused: {
      on: {
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
          actions: 'clearJobContext',
        },
        PROCEED_MANUAL: {
          target: 'checkingProgress',
          actions: 'assignProceedManual',
        },
      },
    },
    complete: {
      on: {
        CLEAR_JOB: {
          target: 'idle',
          actions: 'clearJobContext',
        },
        HYDRATE_OR_START: {
          target: 'checkingProgress',
          actions: 'assignHydrate',
        },
      },
    },
    error: {
      on: {
        CLEAR_JOB: {
          target: 'idle',
          actions: 'clearJobContext',
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
