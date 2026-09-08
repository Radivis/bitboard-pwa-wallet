import { describe, expect, it } from 'vitest'
import {
  formatVtxoExitPhaseCopy,
  vtxoExitPhaseCopyFromPhase,
  VTXO_EXIT_PHASE_COPY,
} from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-selectors'
import type { ArkadeVtxoExitPhase } from '@/workers/arkade-api'

describe('vtxoExitPhaseCopyFromPhase', () => {
  it('phase_copy_waiting_confirmations_vs_timelock_vs_ready', () => {
    const hostBroadcastPhases: ArkadeVtxoExitPhase[] = ['tagged', 'host_broadcast_attempted']
    for (const phase of hostBroadcastPhases) {
      expect(vtxoExitPhaseCopyFromPhase(phase)).toBe(
        VTXO_EXIT_PHASE_COPY.waitingForHostTransactionBroadcast,
      )
    }
    expect(vtxoExitPhaseCopyFromPhase('host_relayed')).toBe(
      VTXO_EXIT_PHASE_COPY.waitingForFirstConfirmation,
    )
    expect(vtxoExitPhaseCopyFromPhase('host_confirmed')).toBe(
      VTXO_EXIT_PHASE_COPY.waitingForSixConfirmations,
    )
    expect(vtxoExitPhaseCopyFromPhase('unrolled')).toBe(
      VTXO_EXIT_PHASE_COPY.waitingForTimelock,
    )
    expect(vtxoExitPhaseCopyFromPhase('complete_ready')).toBe(VTXO_EXIT_PHASE_COPY.ready)
    expect(formatVtxoExitPhaseCopy(VTXO_EXIT_PHASE_COPY.waitingForHostTransactionBroadcast)).toBe(
      'waiting for host transaction broadcast',
    )
    expect(formatVtxoExitPhaseCopy(VTXO_EXIT_PHASE_COPY.waitingForFirstConfirmation)).toBe(
      'waiting for first confirmation',
    )
    expect(formatVtxoExitPhaseCopy(VTXO_EXIT_PHASE_COPY.waitingForSixConfirmations)).toBe(
      'waiting for 6 confirmations',
    )
    expect(formatVtxoExitPhaseCopy(VTXO_EXIT_PHASE_COPY.waitingForTimelock)).toBe(
      'waiting for timelock',
    )
    expect(formatVtxoExitPhaseCopy(VTXO_EXIT_PHASE_COPY.ready)).toBe('ready to complete')
  })
})
