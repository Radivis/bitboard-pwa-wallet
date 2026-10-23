import { describe, expect, it } from 'vitest'
import { UNILATERAL_EXIT_HOST_TX_CONFIRMATIONS } from '@/lib/arkade/unilateral-exit-confirmations'
import {
  formatVtxoExitPhaseCopy,
  hasLeftoverBranchCompleteVtxoChildren,
  resolveArkadeHostCoinStage,
  resolveVtxoExitPhaseForCopy,
  shouldShowUnilateralExitBranchCompleteStatus,
  vtxoExitPhaseCopyFromPhase,
  VTXO_EXIT_PHASE_COPY,
} from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-selectors'
import type { ArkadeVtxoExitPhase } from '@/workers/arkade-api'
import type { VtxoExitChildSnapshotMap } from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-machine-types'

function leftoverChild(
  phase: ArkadeVtxoExitPhase,
): VtxoExitChildSnapshotMap[string] {
  return {
    childId: 'vtxoExit:aa:0',
    txid: 'aa'.repeat(32),
    vout: 0,
    phase,
    machineState: phase,
  }
}

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
      `waiting for ${UNILATERAL_EXIT_HOST_TX_CONFIRMATIONS} confirmations`,
    )
    expect(formatVtxoExitPhaseCopy(VTXO_EXIT_PHASE_COPY.waitingForTimelock)).toBe(
      'waiting for timelock',
    )
    expect(formatVtxoExitPhaseCopy(VTXO_EXIT_PHASE_COPY.ready)).toBe('ready to complete')
  })

  it('prefers child phase over WASM record phase', () => {
    expect(
      resolveVtxoExitPhaseForCopy({
        childPhase: 'unrolled',
        recordPhase: 'host_relayed',
      }),
    ).toBe('unrolled')
    expect(
      resolveVtxoExitPhaseForCopy({
        recordPhase: 'complete_ready',
      }),
    ).toBe('complete_ready')
  })
})

describe('resolveArkadeHostCoinStage', () => {
  const HOST_TXID = 'cc'.repeat(32)

  function hostOutpoint(vout: number, isUnrolled = false) {
    return { txid: HOST_TXID, vout, isUnrolled }
  }

  function hostChild(vout: number, phase: ArkadeVtxoExitPhase): VtxoExitChildSnapshotMap[string] {
    return {
      childId: `vtxoExit:${HOST_TXID}:${vout}`,
      txid: HOST_TXID,
      vout,
      phase,
      machineState: phase,
    }
  }

  function childMap(
    ...children: VtxoExitChildSnapshotMap[string][]
  ): VtxoExitChildSnapshotMap {
    return Object.fromEntries(children.map((child) => [`${child.txid}:${child.vout}`, child]))
  }

  it('arkade_coin_stage_exitable_before_first_confirmation', () => {
    expect(
      resolveArkadeHostCoinStage({
        hostOutpoints: [hostOutpoint(0)],
        nodeConfirmed: false,
        vtxoExitSnapshots: childMap(hostChild(0, 'host_relayed')),
      }),
    ).toBe('exitable')
    expect(
      resolveArkadeHostCoinStage({
        hostOutpoints: [hostOutpoint(0)],
        nodeConfirmed: false,
        vtxoExitSnapshots: {},
      }),
    ).toBe('exitable')
  })

  it('arkade_coin_stage_timelocked_when_node_confirmed', () => {
    expect(
      resolveArkadeHostCoinStage({
        hostOutpoints: [hostOutpoint(0)],
        nodeConfirmed: true,
        vtxoExitSnapshots: childMap(hostChild(0, 'host_relayed')),
      }),
    ).toBe('timelocked')
  })

  it('arkade_coin_stage_timelocked_when_child_host_confirmed', () => {
    expect(
      resolveArkadeHostCoinStage({
        hostOutpoints: [hostOutpoint(0)],
        nodeConfirmed: false,
        vtxoExitSnapshots: childMap(hostChild(0, 'host_confirmed')),
      }),
    ).toBe('timelocked')
  })

  it('arkade_coin_stage_timelocked_when_host_unrolled_without_children', () => {
    expect(
      resolveArkadeHostCoinStage({
        hostOutpoints: [hostOutpoint(0, true), hostOutpoint(1, true)],
        nodeConfirmed: false,
        vtxoExitSnapshots: {},
      }),
    ).toBe('timelocked')
  })

  it('arkade_coin_stage_claimable_when_all_children_complete_ready', () => {
    expect(
      resolveArkadeHostCoinStage({
        hostOutpoints: [hostOutpoint(0, true), hostOutpoint(1, true)],
        nodeConfirmed: false,
        vtxoExitSnapshots: childMap(
          hostChild(0, 'complete_ready'),
          hostChild(1, 'complete_ready'),
        ),
      }),
    ).toBe('claimable')
  })

  it('arkade_coin_stage_timelocked_when_children_mix_complete_ready_and_unrolled', () => {
    expect(
      resolveArkadeHostCoinStage({
        hostOutpoints: [hostOutpoint(0, true), hostOutpoint(1, true)],
        nodeConfirmed: false,
        vtxoExitSnapshots: childMap(hostChild(0, 'complete_ready'), hostChild(1, 'unrolled')),
      }),
    ).toBe('timelocked')
  })
})

describe('branch-complete leftover children', () => {
  it('shows durable branch-complete status for leftover children after the job goes idle', () => {
    expect(hasLeftoverBranchCompleteVtxoChildren({})).toBe(false)
    expect(
      hasLeftoverBranchCompleteVtxoChildren({
        'aa:0': leftoverChild('tagged'),
      }),
    ).toBe(false)
    expect(
      hasLeftoverBranchCompleteVtxoChildren({
        'aa:0': leftoverChild('host_confirmed'),
      }),
    ).toBe(true)

    expect(
      shouldShowUnilateralExitBranchCompleteStatus({
        jobActive: true,
        hasPersistedFailure: false,
        vtxoExitSnapshots: { 'aa:0': leftoverChild('unrolled') },
      }),
    ).toBe(false)
    expect(
      shouldShowUnilateralExitBranchCompleteStatus({
        jobActive: false,
        hasPersistedFailure: true,
        vtxoExitSnapshots: { 'aa:0': leftoverChild('unrolled') },
      }),
    ).toBe(false)
    expect(
      shouldShowUnilateralExitBranchCompleteStatus({
        jobActive: false,
        hasPersistedFailure: false,
        vtxoExitSnapshots: { 'aa:0': leftoverChild('unrolled') },
      }),
    ).toBe(true)
  })

  it('pre_1conf leftover children are not branch-complete', () => {
    const preOneConfPhases: ArkadeVtxoExitPhase[] = [
      'host_broadcast_attempted',
      'host_relayed',
    ]
    for (const phase of preOneConfPhases) {
      expect(
        hasLeftoverBranchCompleteVtxoChildren({
          'aa:0': leftoverChild(phase),
        }),
      ).toBe(false)
      expect(
        shouldShowUnilateralExitBranchCompleteStatus({
          jobActive: false,
          hasPersistedFailure: false,
          vtxoExitSnapshots: { 'aa:0': leftoverChild(phase) },
        }),
      ).toBe(false)
    }
  })
})
