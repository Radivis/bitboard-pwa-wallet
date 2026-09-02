import { createInitialUnilateralExitContext } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import {
  requireUnilateralExitFeeRateSatPerVb,
  requireUnilateralExitWalletScope,
  unilateralExitMachineSetup,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-setup'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'

export type {
  EnsureBroadcastActorInput,
  EvaluateAutomationPolicyActorInput,
  EvaluateJobViabilityActorInput,
  FetchProgressActorInput,
  ProceedStepActorInput,
  ResolveAbortVtxoIdsActorInput,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-setup'

const checkingProgressOnDone = [
  {
    guard: 'isJobCompleteFromFetchEvent',
    target: 'complete',
    actions: ['assignProgressFromFetch', 'clearPersistedJob'],
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
    actions: ['assignProgressFromEnsureBroadcast', 'clearPersistedJob'],
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
    guard: 'shouldContinueAutomationAfterEnsureBroadcast',
    target: 'checkingProgress',
    actions: [
      'assignProgressFromEnsureBroadcast',
      'syncPersistedRelayWaitFromEnsureBroadcast',
      'resumeAutomationProceed',
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

const idlePollTransitions = [
  {
    guard: 'hasActiveAutomaticJob',
    target: 'checkingProgress',
    actions: 'resumeAutomationProceed',
  },
  {
    guard: 'hasActiveManualJob',
    target: 'checkingProgress',
    actions: 'assignProgressRefresh',
  },
] as const

const parentDataWaitTransitions = [
  {
    guard: 'automationEnabled',
    target: 'checkingProgress',
    actions: 'assignProceedForUnconfirmedParentRetry',
  },
  {
    target: 'checkingProgress',
    actions: 'assignProgressRefresh',
  },
] as const

const inFlightAbortAndPrefs = {
  ABORT_ORCHESTRATION: abortOrchestrationTransition,
  AUTOMATION_PREFS_CHANGED: {
    actions: 'assignAutomationPrefs',
  },
} as const

const inFlightAbortPrefsAndProceed = {
  ...inFlightAbortAndPrefs,
  PROCEED_MANUAL: {
    actions: 'assignProceedManual',
  },
} as const

const startManualTransition = {
  target: 'checkingProgress',
  actions: ['assignStartManual', 'persistActiveJobFromContext'],
} as const

const startAutomaticTransition = {
  target: 'checkingProgress',
  actions: ['assignStartAutomatic', 'persistActiveJobFromContext'],
} as const

const hydrateOrStartTransition = {
  target: 'checkingProgress',
  actions: ['assignHydrate', 'ensurePersistedJobFromContext'],
} as const

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
        pollDelay: idlePollTransitions,
      },
      on: {
        START_MANUAL: startManualTransition,
        START_AUTOMATIC: startAutomaticTransition,
        HYDRATE_OR_START: hydrateOrStartTransition,
        PROCEED_MANUAL: {
          target: 'checkingProgress',
          actions: 'assignProceedManual',
        },
        // POLL_TICK is the test/manual equivalent of `after.pollDelay`.
        POLL_TICK: idlePollTransitions,
        ABORT_ORCHESTRATION: abortOrchestrationTransition,
        CLEAR_JOB: {
          actions: ['clearPersistedJob', 'clearJobActorContext'],
        },
        AUTOMATION_PREFS_CHANGED: [
          {
            guard: 'prefsEnabledWithJob',
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
      on: inFlightAbortPrefsAndProceed,
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
      on: inFlightAbortPrefsAndProceed,
      invoke: {
        id: 'fetchProgress',
        src: 'fetchProgressActor',
        input: ({ context }) => ({
          walletScope: context.walletScope,
          outpoints: context.jobOutpoints,
        }),
        onDone: checkingProgressOnDone,
        onError: {
          target: 'error',
          actions: 'assignErrorFromFetch',
        },
      },
    },
    evaluatingPolicy: {
      on: inFlightAbortAndPrefs,
      invoke: {
        id: 'evaluateAutomationPolicy',
        src: 'evaluateAutomationPolicyActor',
        input: ({ context }) => ({
          walletScope: requireUnilateralExitWalletScope(context.walletScope),
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
          {
            target: 'paused',
            actions: 'assignPausedUnknownPolicy',
          },
        ],
        onError: {
          target: 'paused',
          actions: 'assignPolicyError',
        },
      },
    },
    proceeding: {
      on: inFlightAbortAndPrefs,
      invoke: {
        id: 'proceedStep',
        src: 'proceedStepActor',
        input: ({ context }) => ({
          walletScope: requireUnilateralExitWalletScope(context.walletScope),
          outpoints: context.jobOutpoints,
          feeRateSatPerVb: requireUnilateralExitFeeRateSatPerVb(context.feeRateSatPerVb),
        }),
        onDone: [
          {
            guard: 'isJobCompleteFromProceedEvent',
            target: 'complete',
            actions: ['assignProgressFromProceed', 'clearPersistedJob'],
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
            guard: 'automationEnabled',
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
      on: inFlightAbortAndPrefs,
      invoke: {
        id: 'ensureBroadcast',
        src: 'ensureBroadcastActor',
        input: ({ context }) => ({
          walletScope: requireUnilateralExitWalletScope(context.walletScope),
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
            guard: 'automationEnabled',
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
            guard: 'prefsEnabled',
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
        parentDataWait: parentDataWaitTransitions,
      },
      on: {
        ...inFlightAbortAndPrefs,
        POLL_TICK: parentDataWaitTransitions,
        // Must target checkingProgress — not the in-flight assign-only PROCEED_MANUAL map.
        PROCEED_MANUAL: {
          target: 'checkingProgress',
          actions: 'assignProceedManual',
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
            guard: 'prefsEnabled',
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
      entry: ['invalidateUnilateralExitQueriesOnTerminate'],
      on: {
        START_MANUAL: startManualTransition,
        START_AUTOMATIC: startAutomaticTransition,
        CLEAR_JOB: {
          target: 'idle',
          actions: ['clearPersistedJob', 'clearJobActorContext'],
        },
        HYDRATE_OR_START: hydrateOrStartTransition,
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
        'clearTerminatedProceedRequested',
      ],
      invoke: {
        id: 'resolveAbortVtxoIds',
        src: 'resolveAbortVtxoIdsActor',
        input: ({ context, event }) => ({
          outpoints:
            event.type === 'ABORT_ORCHESTRATION' && event.resolvedJobOutpoints.length > 0
              ? sortArkadeVtxoOutpoints(event.resolvedJobOutpoints)
              : context.jobOutpoints,
        }),
        onDone: {
          target: 'idle',
          actions: ['patchAbortedFailureVtxoIds', 'clearJobActorContext'],
        },
        onError: {
          target: 'idle',
          actions: 'clearJobActorContext',
        },
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
