import {
  createInitialVtxoExitContext,
  VTXO_EXIT_MACHINE_STATE,
  type VtxoExitMachineContext,
  type VtxoExitMachineEvent,
  type VtxoExitMachineInput,
  type VtxoExitMachineStateId,
} from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-machine-types'
import {
  ARKADE_VTXO_EXIT_PHASES,
  isArkadeVtxoExitPhase,
  type ArkadeVtxoExitPhase,
} from '@/workers/arkade-api'
import { assign, setup } from 'xstate'

export const vtxoExitMachineSetup = setup({
  types: {
    context: {} as VtxoExitMachineContext,
    events: {} as VtxoExitMachineEvent,
    input: {} as VtxoExitMachineInput,
  },
  guards: {
    hydratePhaseIs: ({ event }, params: { phase: ArkadeVtxoExitPhase }) => {
      return event.type === 'HYDRATE' && event.phase === params.phase
    },
    contextPhaseIs: ({ context }, params: { phase: ArkadeVtxoExitPhase }) => {
      return context.phase === params.phase
    },
  },
  actions: {
    assignHydratePhase: assign({
      phase: ({ context, event }) =>
        event.type === 'HYDRATE' ? event.phase : context.phase,
    }),
    assignPhaseHostBroadcastAttempted: assign({
      phase: 'host_broadcast_attempted' as const,
    }),
    assignPhaseHostRelayed: assign({ phase: 'host_relayed' as const }),
    assignPhaseHostConfirmed: assign({ phase: 'host_confirmed' as const }),
    assignPhaseUnrolled: assign({ phase: 'unrolled' as const }),
    assignPhaseCompleteReady: assign({ phase: 'complete_ready' as const }),
    assignPhaseExited: assign({ phase: 'exited' as const }),
    assignPhaseFundingLost: assign({ phase: 'funding_lost' as const }),
  },
})

const hydrateTransitions = ARKADE_VTXO_EXIT_PHASES.map((phase) => ({
  guard: {
    type: 'hydratePhaseIs' as const,
    params: { phase },
  },
  target: `.${phase}`,
  actions: 'assignHydratePhase' as const,
}))

const routingAlways = ARKADE_VTXO_EXIT_PHASES.map((phase) => ({
  guard: {
    type: 'contextPhaseIs' as const,
    params: { phase },
  },
  target: phase,
}))

export const vtxoExitMachine = vtxoExitMachineSetup.createMachine({
  id: 'vtxoExit',
  context: ({ input }) => createInitialVtxoExitContext(input),
  initial: 'routing',
  on: {
    HYDRATE: hydrateTransitions,
    HOST_REGISTERED: {
      target: '.host_broadcast_attempted',
      actions: 'assignPhaseHostBroadcastAttempted',
    },
    HOST_RELAYED: {
      target: '.host_relayed',
      actions: 'assignPhaseHostRelayed',
    },
    HOST_CONFIRMED: {
      target: '.host_confirmed',
      actions: 'assignPhaseHostConfirmed',
    },
    UNROLLED: {
      target: '.unrolled',
      actions: 'assignPhaseUnrolled',
    },
    COMPLETE_READY: {
      target: '.complete_ready',
      actions: 'assignPhaseCompleteReady',
    },
    EXITED: {
      target: '.exited',
      actions: 'assignPhaseExited',
    },
    FUNDING_LOST: {
      target: '.funding_lost',
      actions: 'assignPhaseFundingLost',
    },
  },
  states: {
    routing: {
      always: routingAlways,
    },
    tagged: {
      on: {
        UNTAG: {
          target: 'idle',
        },
      },
    },
    host_broadcast_attempted: {},
    host_relayed: {},
    host_confirmed: {},
    unrolled: {},
    complete_ready: {},
    exited: {},
    funding_lost: {},
    idle: {},
  },
})

export function vtxoExitSnapshotState(
  value: string | Record<string, unknown>,
): VtxoExitMachineStateId {
  if (typeof value === 'string' && value in VTXO_EXIT_MACHINE_STATE) {
    return value as VtxoExitMachineStateId
  }
  return VTXO_EXIT_MACHINE_STATE.routing
}

export function vtxoExitPhaseFromMachineState(
  value: VtxoExitMachineStateId,
): ArkadeVtxoExitPhase | null {
  if (value === 'routing' || value === 'idle') {
    return null
  }
  if (isArkadeVtxoExitPhase(value)) {
    return value
  }
  return null
}
