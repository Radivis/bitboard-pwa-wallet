import { describe, expect, it } from 'vitest'
import type { BarkExitNodeSweepKind, BarkExitNodeSweepVtxoItem } from '@/lib/bark/bark-exit-seizure'
import {
  barkVtxoIdsKeptWhenFinished,
  formatBarkVtxoEmergencyExitPhaseLine,
  formatBarkVtxoExitPhaseTitle,
  resolveBarkVtxoExitPhase,
} from '@/lib/bark/bark-vtxo-exit-phase'
import type {
  BarkEmergencyExitRow,
  BarkEmergencyExitState,
  BarkExitGraphNode,
  BarkVtxoState,
} from '@/workers/bark-api'

function exitRow(
  vtxoId: string,
  state: BarkEmergencyExitState,
  heights: Partial<Pick<BarkEmergencyExitRow, 'tipHeight' | 'confirmedHeight' | 'claimableHeight'>> = {},
): BarkEmergencyExitRow {
  return { vtxoId, state, cancelable: false, ...heights }
}

function graphNode(overrides: Partial<BarkExitGraphNode> & Pick<BarkExitGraphNode, 'txid'>): BarkExitGraphNode {
  return {
    spends: [],
    leafVtxoIds: [],
    status: 'pending',
    needsChild: false,
    waitingOnTxids: [],
    txType: 'tree',
    ...overrides,
  }
}

function phaseLine(params: {
  vtxoState?: BarkVtxoState
  exitRow?: BarkEmergencyExitRow | null
  graphNodes?: readonly BarkExitGraphNode[] | null
  unfundedParentTxids?: ReadonlySet<string>
  sweptNodeKinds?: readonly BarkExitNodeSweepKind[]
  sweepItems?: readonly BarkExitNodeSweepVtxoItem[]
}): string | null {
  return formatBarkVtxoEmergencyExitPhaseLine(resolvedPhase(params))
}

function resolvedPhase(params: {
  vtxoState?: BarkVtxoState
  exitRow?: BarkEmergencyExitRow | null
  graphNodes?: readonly BarkExitGraphNode[] | null
  unfundedParentTxids?: ReadonlySet<string>
  sweptNodeKinds?: readonly BarkExitNodeSweepKind[]
  sweepItems?: readonly BarkExitNodeSweepVtxoItem[]
}) {
  const sweepItems =
    params.sweepItems ??
    (params.sweptNodeKinds ?? []).map((nodeKind) => ({ vtxoId: 'vtxo-1', nodeKind }))
  return resolveBarkVtxoExitPhase({
    vtxoState: params.vtxoState ?? 'spendable',
    exitRow: params.exitRow ?? null,
    graphNodes: params.graphNodes ?? null,
    unfundedParentTxids: params.unfundedParentTxids ?? new Set(),
    sweepItems,
  })
}

const anchor = graphNode({
  txid: 'anchor',
  status: 'confirmed',
  txType: 'commitment',
})
const parent = graphNode({
  txid: 'parent',
  spends: ['anchor'],
  status: 'confirmed',
})
const leaf = graphNode({
  txid: 'leaf',
  spends: ['parent'],
  leafVtxoIds: ['vtxo-1'],
  status: 'inProgress',
})

describe('resolveBarkVtxoExitPhase', () => {
  it('omits the line when the coin has no exit', () => {
    expect(phaseLine({})).toBeNull()
  })

  it('reads a started exit', () => {
    expect(phaseLine({ exitRow: exitRow('vtxo-1', 'start') })).toBe(
      'Emergency exit phase: started',
    )
  })

  it('reads processing until the exit tree has loaded', () => {
    expect(phaseLine({ exitRow: exitRow('vtxo-1', 'processing'), graphNodes: null })).toBe(
      'Emergency exit phase: processing',
    )
  })

  it('reads a pending frontier as started', () => {
    expect(
      phaseLine({
        exitRow: exitRow('vtxo-1', 'processing'),
        graphNodes: [{ ...leaf, status: 'pending', needsChild: false }],
      }),
    ).toBe('Emergency exit phase: started')
  })

  it('reads a shortfall frontier as waiting for confirmed funds', () => {
    expect(
      phaseLine({
        exitRow: exitRow('vtxo-1', 'processing'),
        graphNodes: [{ ...leaf, needsChild: true }],
        unfundedParentTxids: new Set(['leaf']),
      }),
    ).toBe('Emergency exit phase: waiting for confirmed funds')
  })

  it('reads a childless frontier as waiting to broadcast', () => {
    expect(
      phaseLine({
        exitRow: exitRow('vtxo-1', 'processing'),
        graphNodes: [{ ...leaf, needsChild: true }],
      }),
    ).toBe('Emergency exit phase: waiting to broadcast')
  })

  it('reads an in-progress frontier as waiting for confirmation', () => {
    expect(
      phaseLine({
        exitRow: exitRow('vtxo-1', 'processing'),
        graphNodes: [leaf],
      }),
    ).toBe('Emergency exit phase: waiting for confirmation')
  })

  it('counts confirmed exit transactions and skips the chain anchor', () => {
    expect(
      phaseLine({
        exitRow: exitRow('vtxo-1', 'processing'),
        graphNodes: [anchor, parent, leaf],
      }),
    ).toBe('Emergency exit phase: waiting for confirmation, 1 of 2 exit transactions confirmed')
  })

  it('reads the timelock as blocks elapsed of the total', () => {
    expect(
      phaseLine({
        vtxoState: 'exited',
        exitRow: exitRow('vtxo-1', 'awaitingDelta', {
          tipHeight: 100,
          confirmedHeight: 90,
          claimableHeight: 130,
        }),
      }),
    ).toBe('Emergency exit phase: waiting for timelock, 10 of 40 blocks')
  })

  it('clamps timelock progress to the total', () => {
    expect(
      phaseLine({
        vtxoState: 'exited',
        exitRow: exitRow('vtxo-1', 'awaitingDelta', {
          tipHeight: 200,
          confirmedHeight: 90,
          claimableHeight: 130,
        }),
      }),
    ).toBe('Emergency exit phase: waiting for timelock, 40 of 40 blocks')
  })

  it('omits the block count when the timelock heights are missing', () => {
    expect(
      phaseLine({
        vtxoState: 'exited',
        exitRow: exitRow('vtxo-1', 'awaitingDelta'),
      }),
    ).toBe('Emergency exit phase: waiting for timelock')
  })

  it('reads claimable and claim in progress', () => {
    expect(phaseLine({ exitRow: exitRow('vtxo-1', 'claimable') })).toBe(
      'Emergency exit phase: ready to claim',
    )
    expect(phaseLine({ exitRow: exitRow('vtxo-1', 'claimInProgress') })).toBe(
      'Emergency exit phase: claim in progress',
    )
  })

  it('reads an exited coin with no live row as claimed', () => {
    expect(phaseLine({ vtxoState: 'exited' })).toBe('Emergency exit phase: claimed')
  })

  it('keeps an anchor sweep and a checkpoint seizure listed when spent coins are hidden', () => {
    expect(
      barkVtxoIdsKeptWhenFinished({
        exitRows: [exitRow('live', 'start')],
        exitNodeSweepVtxoItems: [
          { vtxoId: 'swept', nodeKind: 'anchor' },
          { vtxoId: 'seized', nodeKind: 'checkpoint' },
          { vtxoId: 'leaf', nodeKind: 'leaf' },
          { vtxoId: 'internal', nodeKind: 'internal' },
        ],
      }),
    ).toEqual(new Set(['live', 'swept', 'seized', 'leaf', 'internal']))
  })

  it('lets an anchor sweep win over a live exit', () => {
    expect(
      phaseLine({
        exitRow: exitRow('vtxo-1', 'start'),
        sweptNodeKinds: ['anchor'],
      }),
    ).toBe('Emergency exit phase: anchor swept')
  })

  it('lets a checkpoint seizure win over a live exit', () => {
    expect(
      phaseLine({
        vtxoState: 'spent',
        exitRow: exitRow('vtxo-1', 'awaitingDelta', {
          tipHeight: 100,
          confirmedHeight: 90,
          claimableHeight: 130,
        }),
        sweptNodeKinds: ['checkpoint'],
      }),
    ).toBe('Emergency exit phase: checkpoint seized')
  })

  it('names the seized node, and an upstream node wins when more than one kind includes the coin', () => {
    expect(phaseLine({ sweptNodeKinds: ['leaf'] })).toBe('Emergency exit phase: leaf seized')
    expect(phaseLine({ sweptNodeKinds: ['internal'] })).toBe(
      'Emergency exit phase: internal node seized',
    )
    expect(phaseLine({ sweptNodeKinds: ['internal', 'leaf', 'checkpoint'] })).toBe(
      'Emergency exit phase: internal node seized',
    )
  })

  it('names the spending transaction beside the winning node type', () => {
    const anchorTxid = 'aa'.repeat(32)
    const internalTxid = 'bb'.repeat(32)
    const phase = resolvedPhase({
      sweepItems: [
        { vtxoId: 'vtxo-1', nodeKind: 'internal', spenderTxid: internalTxid },
        { vtxoId: 'vtxo-1', nodeKind: 'anchor', spenderTxid: anchorTxid },
      ],
    })
    expect(formatBarkVtxoEmergencyExitPhaseLine(phase)).toBe(
      `Emergency exit phase: anchor swept · ${anchorTxid}`,
    )
    expect(formatBarkVtxoExitPhaseTitle(phase)).toBe(anchorTxid)
  })

  it('names every spending transaction of the winning kind and omits a missing one', () => {
    const earlierTxid = 'aa'.repeat(32)
    const laterTxid = 'cc'.repeat(32)
    const phase = resolvedPhase({
      sweepItems: [
        { vtxoId: 'vtxo-1', nodeKind: 'leaf', spenderTxid: laterTxid },
        { vtxoId: 'vtxo-1', nodeKind: 'leaf', spenderTxid: earlierTxid },
      ],
    })
    expect(formatBarkVtxoEmergencyExitPhaseLine(phase)).toBe(
      `Emergency exit phase: leaf seized · ${earlierTxid} · ${laterTxid}`,
    )
    expect(formatBarkVtxoExitPhaseTitle(phase)).toBe(`${earlierTxid} ${laterTxid}`)
    expect(phaseLine({ sweptNodeKinds: ['leaf'] })).toBe('Emergency exit phase: leaf seized')
    expect(formatBarkVtxoExitPhaseTitle(resolvedPhase({ sweptNodeKinds: ['leaf'] }))).toBeNull()
  })
})
