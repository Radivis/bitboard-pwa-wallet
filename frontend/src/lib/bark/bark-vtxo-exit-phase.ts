import {
  BARK_EXIT_NODE_PHASE,
  resolveBarkExitNodePhase,
  type BarkExitNodePhase,
} from '@/lib/bark/bark-exit-graph-layout'
import type {
  BarkExitNodeSweepKind,
  BarkExitNodeSweepVtxoItem,
} from '@/lib/bark/bark-exit-seizure'
import type {
  BarkEmergencyExitRow,
  BarkExitGraphNode,
  BarkVtxoState,
} from '@/workers/bark-api'

const EMERGENCY_EXIT_PHASE_LINE_PREFIX = 'Emergency exit phase: '

export const BARK_VTXO_EXIT_PHASE = {
  started: 'started',
  processing: 'processing',
  awaitingBumperFunding: 'awaitingBumperFunding',
  awaitingCpfpBroadcast: 'awaitingCpfpBroadcast',
  awaitingConfirmation: 'awaitingConfirmation',
  awaitingTimelock: 'awaitingTimelock',
  claimable: 'claimable',
  claimInProgress: 'claimInProgress',
  claimed: 'claimed',
  anchorSwept: 'anchorSwept',
  internalSeized: 'internalSeized',
  leafSeized: 'leafSeized',
  checkpointSeized: 'checkpointSeized',
} as const

export type BarkVtxoExitPhaseKind = (typeof BARK_VTXO_EXIT_PHASE)[keyof typeof BARK_VTXO_EXIT_PHASE]

export type ConfirmedExitTransactionCount = {
  confirmed: number
  total: number
}

export type BarkVtxoExitPhase =
  | { kind: typeof BARK_VTXO_EXIT_PHASE.started }
  | { kind: typeof BARK_VTXO_EXIT_PHASE.processing }
  | {
      kind: typeof BARK_VTXO_EXIT_PHASE.awaitingBumperFunding
      confirmedExitTransactions: ConfirmedExitTransactionCount | null
    }
  | {
      kind: typeof BARK_VTXO_EXIT_PHASE.awaitingCpfpBroadcast
      confirmedExitTransactions: ConfirmedExitTransactionCount | null
    }
  | {
      kind: typeof BARK_VTXO_EXIT_PHASE.awaitingConfirmation
      confirmedExitTransactions: ConfirmedExitTransactionCount | null
    }
  | {
      kind: typeof BARK_VTXO_EXIT_PHASE.awaitingTimelock
      elapsedBlocks: number | null
      totalBlocks: number | null
    }
  | { kind: typeof BARK_VTXO_EXIT_PHASE.claimable }
  | { kind: typeof BARK_VTXO_EXIT_PHASE.claimInProgress }
  | { kind: typeof BARK_VTXO_EXIT_PHASE.claimed }
  | { kind: typeof BARK_VTXO_EXIT_PHASE.anchorSwept; spenderTxids: readonly string[] }
  | { kind: typeof BARK_VTXO_EXIT_PHASE.internalSeized; spenderTxids: readonly string[] }
  | { kind: typeof BARK_VTXO_EXIT_PHASE.leafSeized; spenderTxids: readonly string[] }
  | { kind: typeof BARK_VTXO_EXIT_PHASE.checkpointSeized; spenderTxids: readonly string[] }

const FRONTIER_PHASES_WITH_CONFIRMED_COUNT = new Set<BarkExitNodePhase>([
  BARK_EXIT_NODE_PHASE.awaitingBumperFunding,
  BARK_EXIT_NODE_PHASE.awaitingCpfpBroadcast,
  BARK_EXIT_NODE_PHASE.awaitingConfirmation,
])

export function resolveBarkVtxoExitPhase(params: {
  vtxoState: BarkVtxoState
  exitRow: BarkEmergencyExitRow | null
  graphNodes: readonly BarkExitGraphNode[] | null
  unfundedParentTxids: ReadonlySet<string>
  sweepItems: readonly BarkExitNodeSweepVtxoItem[]
}): BarkVtxoExitPhase | null {
  if (hasSweepKind(params.sweepItems, 'anchor')) {
    return {
      kind: BARK_VTXO_EXIT_PHASE.anchorSwept,
      spenderTxids: spenderTxidsForKind(params.sweepItems, 'anchor'),
    }
  }
  if (hasSweepKind(params.sweepItems, 'internal')) {
    return {
      kind: BARK_VTXO_EXIT_PHASE.internalSeized,
      spenderTxids: spenderTxidsForKind(params.sweepItems, 'internal'),
    }
  }
  if (hasSweepKind(params.sweepItems, 'leaf')) {
    return {
      kind: BARK_VTXO_EXIT_PHASE.leafSeized,
      spenderTxids: spenderTxidsForKind(params.sweepItems, 'leaf'),
    }
  }
  if (hasSweepKind(params.sweepItems, 'checkpoint')) {
    return {
      kind: BARK_VTXO_EXIT_PHASE.checkpointSeized,
      spenderTxids: spenderTxidsForKind(params.sweepItems, 'checkpoint'),
    }
  }
  if (params.exitRow == null) {
    return params.vtxoState === 'exited' ? { kind: BARK_VTXO_EXIT_PHASE.claimed } : null
  }
  return phaseFromExitRow(params.exitRow, params.graphNodes, params.unfundedParentTxids)
}

export function formatBarkVtxoEmergencyExitPhaseLine(
  phase: BarkVtxoExitPhase | null,
): string | null {
  const copy = formatBarkVtxoExitPhaseCopy(phase)
  if (copy == null) return null
  return `${EMERGENCY_EXIT_PHASE_LINE_PREFIX}${copy}`
}

/** Full spending transaction ids for a sweep or seizure phase, for the element title. */
export function formatBarkVtxoExitPhaseTitle(phase: BarkVtxoExitPhase | null): string | null {
  const spenderTxids = spenderTxidsOfPhase(phase)
  if (spenderTxids.length === 0) return null
  return spenderTxids.join(' ')
}

export function barkVtxoIdsKeptWhenFinished(params: {
  exitRows: readonly BarkEmergencyExitRow[]
  exitNodeSweepVtxoItems: readonly BarkExitNodeSweepVtxoItem[]
}): Set<string> {
  return new Set([
    ...params.exitRows.map((row) => row.vtxoId),
    ...params.exitNodeSweepVtxoItems.map((item) => item.vtxoId),
  ])
}

function phaseFromExitRow(
  exitRow: BarkEmergencyExitRow,
  graphNodes: readonly BarkExitGraphNode[] | null,
  unfundedParentTxids: ReadonlySet<string>,
): BarkVtxoExitPhase | null {
  switch (exitRow.state) {
    case 'start':
      return { kind: BARK_VTXO_EXIT_PHASE.started }
    case 'processing':
      return phaseFromProcessing(exitRow.vtxoId, graphNodes, unfundedParentTxids)
    case 'awaitingDelta':
      return awaitingTimelockPhase(exitRow)
    case 'claimable':
      return { kind: BARK_VTXO_EXIT_PHASE.claimable }
    case 'claimInProgress':
      return { kind: BARK_VTXO_EXIT_PHASE.claimInProgress }
    case 'claimed':
      return { kind: BARK_VTXO_EXIT_PHASE.claimed }
    default:
      return null
  }
}

function phaseFromProcessing(
  vtxoId: string,
  graphNodes: readonly BarkExitGraphNode[] | null,
  unfundedParentTxids: ReadonlySet<string>,
): BarkVtxoExitPhase {
  if (graphNodes == null) return { kind: BARK_VTXO_EXIT_PHASE.processing }
  const orderedPath = orderExitPathFromAnchor(vtxoId, graphNodes)
  if (orderedPath.length === 0) return { kind: BARK_VTXO_EXIT_PHASE.processing }

  const frontier = orderedPath.find(
    (node) => nodePhase(node, unfundedParentTxids) !== BARK_EXIT_NODE_PHASE.confirmed,
  )
  const frontierPhase =
    frontier == null
      ? BARK_EXIT_NODE_PHASE.awaitingConfirmation
      : nodePhase(frontier, unfundedParentTxids)
  if (frontierPhase === BARK_EXIT_NODE_PHASE.notProcessing) {
    return { kind: BARK_VTXO_EXIT_PHASE.started }
  }
  const confirmedExitTransactions = FRONTIER_PHASES_WITH_CONFIRMED_COUNT.has(frontierPhase)
    ? confirmedExitTransactionCount(orderedPath, unfundedParentTxids)
    : null
  return phaseFromFrontier(frontierPhase, confirmedExitTransactions)
}

function phaseFromFrontier(
  frontierPhase: BarkExitNodePhase,
  confirmedExitTransactions: ConfirmedExitTransactionCount | null,
): BarkVtxoExitPhase {
  switch (frontierPhase) {
    case BARK_EXIT_NODE_PHASE.awaitingBumperFunding:
      return { kind: BARK_VTXO_EXIT_PHASE.awaitingBumperFunding, confirmedExitTransactions }
    case BARK_EXIT_NODE_PHASE.awaitingCpfpBroadcast:
      return { kind: BARK_VTXO_EXIT_PHASE.awaitingCpfpBroadcast, confirmedExitTransactions }
    case BARK_EXIT_NODE_PHASE.awaitingConfirmation:
    case BARK_EXIT_NODE_PHASE.confirmed:
      return { kind: BARK_VTXO_EXIT_PHASE.awaitingConfirmation, confirmedExitTransactions }
    default:
      return { kind: BARK_VTXO_EXIT_PHASE.started }
  }
}

function awaitingTimelockPhase(exitRow: BarkEmergencyExitRow): BarkVtxoExitPhase {
  const progress = timelockBlockProgress(exitRow)
  return {
    kind: BARK_VTXO_EXIT_PHASE.awaitingTimelock,
    elapsedBlocks: progress?.elapsedBlocks ?? null,
    totalBlocks: progress?.totalBlocks ?? null,
  }
}

function timelockBlockProgress(
  exitRow: BarkEmergencyExitRow,
): { elapsedBlocks: number; totalBlocks: number } | null {
  const { tipHeight, confirmedHeight, claimableHeight } = exitRow
  if (tipHeight == null || confirmedHeight == null || claimableHeight == null) return null
  const totalBlocks = claimableHeight - confirmedHeight
  if (totalBlocks <= 0) return null
  const elapsedBlocks = Math.min(Math.max(tipHeight - confirmedHeight, 0), totalBlocks)
  return { elapsedBlocks, totalBlocks }
}

function formatBarkVtxoExitPhaseCopy(phase: BarkVtxoExitPhase | null): string | null {
  if (phase == null) return null
  switch (phase.kind) {
    case BARK_VTXO_EXIT_PHASE.started:
      return 'started'
    case BARK_VTXO_EXIT_PHASE.processing:
      return 'processing'
    case BARK_VTXO_EXIT_PHASE.awaitingBumperFunding:
      return withConfirmedCount('waiting for confirmed funds', phase.confirmedExitTransactions)
    case BARK_VTXO_EXIT_PHASE.awaitingCpfpBroadcast:
      return withConfirmedCount('waiting to broadcast', phase.confirmedExitTransactions)
    case BARK_VTXO_EXIT_PHASE.awaitingConfirmation:
      return withConfirmedCount('waiting for confirmation', phase.confirmedExitTransactions)
    case BARK_VTXO_EXIT_PHASE.awaitingTimelock:
      return timelockCopy(phase.elapsedBlocks, phase.totalBlocks)
    case BARK_VTXO_EXIT_PHASE.claimable:
      return 'ready to claim'
    case BARK_VTXO_EXIT_PHASE.claimInProgress:
      return 'claim in progress'
    case BARK_VTXO_EXIT_PHASE.claimed:
      return 'claimed'
    case BARK_VTXO_EXIT_PHASE.anchorSwept:
      return withSpenderTxids('anchor swept', phase.spenderTxids)
    case BARK_VTXO_EXIT_PHASE.internalSeized:
      return withSpenderTxids('internal node seized', phase.spenderTxids)
    case BARK_VTXO_EXIT_PHASE.leafSeized:
      return withSpenderTxids('leaf seized', phase.spenderTxids)
    case BARK_VTXO_EXIT_PHASE.checkpointSeized:
      return withSpenderTxids('checkpoint seized', phase.spenderTxids)
  }
}

function hasSweepKind(
  items: readonly BarkExitNodeSweepVtxoItem[],
  kind: BarkExitNodeSweepKind,
): boolean {
  return items.some((item) => item.nodeKind === kind)
}

function spenderTxidsForKind(
  items: readonly BarkExitNodeSweepVtxoItem[],
  kind: BarkExitNodeSweepKind,
): string[] {
  const spenderTxids = new Set<string>()
  for (const item of items) {
    if (item.nodeKind !== kind || item.spenderTxid == null || item.spenderTxid.length === 0) {
      continue
    }
    spenderTxids.add(item.spenderTxid)
  }
  return [...spenderTxids].sort()
}

function spenderTxidsOfPhase(phase: BarkVtxoExitPhase | null): readonly string[] {
  if (phase == null) return []
  switch (phase.kind) {
    case BARK_VTXO_EXIT_PHASE.anchorSwept:
    case BARK_VTXO_EXIT_PHASE.internalSeized:
    case BARK_VTXO_EXIT_PHASE.leafSeized:
    case BARK_VTXO_EXIT_PHASE.checkpointSeized:
      return phase.spenderTxids
    default:
      return []
  }
}

function withSpenderTxids(label: string, spenderTxids: readonly string[]): string {
  if (spenderTxids.length === 0) return label
  return `${label} · ${spenderTxids.join(' · ')}`
}

function withConfirmedCount(
  base: string,
  count: ConfirmedExitTransactionCount | null,
): string {
  if (count == null || count.confirmed < 1) return base
  const noun = count.total === 1 ? 'exit transaction' : 'exit transactions'
  return `${base}, ${count.confirmed} of ${count.total} ${noun} confirmed`
}

function timelockCopy(elapsedBlocks: number | null, totalBlocks: number | null): string {
  if (elapsedBlocks == null || totalBlocks == null) return 'waiting for timelock'
  const noun = totalBlocks === 1 ? 'block' : 'blocks'
  return `waiting for timelock, ${elapsedBlocks} of ${totalBlocks} ${noun}`
}

function nodePhase(
  node: BarkExitGraphNode,
  unfundedParentTxids: ReadonlySet<string>,
): BarkExitNodePhase {
  return resolveBarkExitNodePhase({
    status: node.status,
    needsChild: node.needsChild,
    txid: node.txid,
    unfundedParentTxids,
  })
}

/** Exit transactions on the coin's path, from the chain anchor toward the leaf. */
function orderExitPathFromAnchor(
  vtxoId: string,
  graphNodes: readonly BarkExitGraphNode[],
): BarkExitGraphNode[] {
  const path = exitPathNodes(vtxoId, graphNodes)
  const pathTxids = new Set(path.map((node) => node.txid))
  const childrenByParent = new Map<string, BarkExitGraphNode[]>()
  const roots: BarkExitGraphNode[] = []
  for (const node of path) {
    const parentsOnPath = node.spends.filter((txid) => pathTxids.has(txid))
    if (parentsOnPath.length === 0) roots.push(node)
    for (const parentTxid of parentsOnPath) {
      const children = childrenByParent.get(parentTxid) ?? []
      children.push(node)
      childrenByParent.set(parentTxid, children)
    }
  }

  const ordered: BarkExitGraphNode[] = []
  const pending = [...roots]
  const seen = new Set<string>()
  while (pending.length > 0) {
    const node = pending.shift()
    if (node == null || seen.has(node.txid)) continue
    seen.add(node.txid)
    ordered.push(node)
    pending.push(...(childrenByParent.get(node.txid) ?? []))
  }
  return ordered
}

function exitPathNodes(
  vtxoId: string,
  graphNodes: readonly BarkExitGraphNode[],
): BarkExitGraphNode[] {
  const nodeByTxid = new Map(graphNodes.map((node) => [node.txid, node]))
  const path = new Map<string, BarkExitGraphNode>()
  const pending = graphNodes.filter((node) => node.leafVtxoIds.includes(vtxoId))
  while (pending.length > 0) {
    const node = pending.pop()
    if (node == null || path.has(node.txid)) continue
    path.set(node.txid, node)
    for (const parentTxid of node.spends) {
      const parent = nodeByTxid.get(parentTxid)
      if (parent != null) pending.push(parent)
    }
  }
  return [...path.values()]
}

function confirmedExitTransactionCount(
  orderedPath: readonly BarkExitGraphNode[],
  unfundedParentTxids: ReadonlySet<string>,
): ConfirmedExitTransactionCount | null {
  const exitTransactions = orderedPath.filter((node) => node.txType !== 'commitment')
  const confirmed = exitTransactions.filter(
    (node) => nodePhase(node, unfundedParentTxids) === BARK_EXIT_NODE_PHASE.confirmed,
  ).length
  if (confirmed < 1) return null
  return { confirmed, total: exitTransactions.length }
}
