import {
  coordSimplex,
  decrossTwoLayer,
  graphConnect,
  layeringSimplex,
  sugiyama,
} from 'd3-dag'
import type { Node } from '@xyflow/react'
import { getSmoothStepPath } from '@xyflow/react'
import {
  connectionPointFromNodeCenter,
  EXIT_GRAPH_DEFAULT_EDGE_COLOR,
  EXIT_GRAPH_DEFAULT_STROKE_WIDTH,
  EXIT_GRAPH_PATH_EDGE_COLOR,
  EXIT_GRAPH_PATH_STROKE_WIDTH,
  resolveLayoutDirection,
  resolveNodeConnectionPositions,
  shortTxid,
  UNILATERAL_EXIT_NODE_DIAMETER_PX,
  type UnilateralExitLayoutDirection,
} from '@/lib/arkade/unilateral-exit-topology'
import {
  resolveExitCoinStage,
  type ExitCoinStage,
} from '@/lib/arkade/unilateral-exit-node-icons'
import type {
  BarkEmergencyExitRow,
  BarkEmergencyExitState,
  BarkExitGraphNode,
  BarkExitGraphNodeStatus,
  BarkExitGraphTxType,
} from '@/workers/bark-api'

export { resolveLayoutDirection, shortTxid }

/** Rendered node diameter in px (`size-12`). Same size as a unilateral-exit node. */
export const BARK_EXIT_NODE_DIAMETER_PX = UNILATERAL_EXIT_NODE_DIAMETER_PX

const BARK_EXIT_LAYOUT_NODE_SIZE_PX = BARK_EXIT_NODE_DIAMETER_PX * 2

export type BarkExitGraphEdgePath = {
  id: string
  path: string
  animated: boolean
  stroke: string
  strokeWidth: number
}

export type BarkExitTreeNodeData = {
  txid: string
  txType: BarkExitGraphTxType
  status: BarkExitGraphNodeStatus
  phase: BarkExitNodePhase
  isOnExitPath: boolean
  isLeaf: boolean
  leafVtxoCount: number
  coinStage: ExitCoinStage
  isFocused: boolean
  layoutDirection: UnilateralExitLayoutDirection
}

export const BARK_EXIT_NODE_PHASE = {
  notProcessing: 'notProcessing',
  awaitingBumperFunding: 'awaitingBumperFunding',
  awaitingCpfpBroadcast: 'awaitingCpfpBroadcast',
  awaitingConfirmation: 'awaitingConfirmation',
  confirmed: 'confirmed',
} as const

export type BarkExitNodePhase = (typeof BARK_EXIT_NODE_PHASE)[keyof typeof BARK_EXIT_NODE_PHASE]

/** Corner-badge copy. Not processing and confirmed use the status line and the check. */
export function barkExitNodePhaseLabel(phase: BarkExitNodePhase): string | null {
  switch (phase) {
    case BARK_EXIT_NODE_PHASE.awaitingBumperFunding:
      return 'Waiting for confirmed funds'
    case BARK_EXIT_NODE_PHASE.awaitingCpfpBroadcast:
      return 'Broadcasting'
    case BARK_EXIT_NODE_PHASE.awaitingConfirmation:
      return 'Waiting for confirmation'
    default:
      return null
  }
}

/**
 * Maps a stored exit-graph node to a corner phase. A shortfall parent is waiting for
 * bumper funds; every other child-less in-progress node is waiting to broadcast.
 */
export function resolveBarkExitNodePhase(params: {
  status: BarkExitGraphNodeStatus
  needsChild: boolean
  txid: string
  unfundedParentTxids: ReadonlySet<string>
}): BarkExitNodePhase {
  if (params.status === 'confirmed') return BARK_EXIT_NODE_PHASE.confirmed
  if (params.status === 'inProgress' && params.needsChild) {
    return params.unfundedParentTxids.has(params.txid)
      ? BARK_EXIT_NODE_PHASE.awaitingBumperFunding
      : BARK_EXIT_NODE_PHASE.awaitingCpfpBroadcast
  }
  if (params.status === 'inProgress') return BARK_EXIT_NODE_PHASE.awaitingConfirmation
  return BARK_EXIT_NODE_PHASE.notProcessing
}

const BARK_EXIT_TIMELOCK_ELAPSED_STATES: ReadonlySet<BarkEmergencyExitState> = new Set([
  'claimable',
  'claimInProgress',
  'claimed',
])

/** Coin badge stage for a leaf tx: Bark's `awaitingDelta` is the exit timelock, `claimable` its end. */
export function resolveBarkLeafCoinStage(params: {
  leafVtxoIds: string[]
  status: BarkExitGraphNodeStatus
  exitRows: BarkEmergencyExitRow[]
}): ExitCoinStage {
  const trackedStates = params.exitRows
    .filter((row) => params.leafVtxoIds.includes(row.vtxoId))
    .map((row) => row.state)
  return resolveExitCoinStage({
    trackedVtxosPastTimelock: trackedStates.map((state) =>
      BARK_EXIT_TIMELOCK_ELAPSED_STATES.has(state),
    ),
    txConfirmed: params.status === 'confirmed' || trackedStates.includes('awaitingDelta'),
  })
}

export function barkExitPathTxids(nodes: BarkExitGraphNode[]): Set<string> {
  const nodeByTxid = new Map(nodes.map((node) => [node.txid, node]))
  const pathTxids = new Set<string>()
  for (const node of nodes) {
    if (node.leafVtxoIds.length === 0) continue
    collectAncestorTxids(node.txid, nodeByTxid, pathTxids)
  }
  return pathTxids
}

function collectAncestorTxids(
  startTxid: string,
  nodeByTxid: Map<string, BarkExitGraphNode>,
  pathTxids: Set<string>,
) {
  const stack = [startTxid]
  const visited = new Set<string>()
  while (stack.length > 0) {
    const txid = stack.pop()
    if (txid == null || visited.has(txid)) continue
    visited.add(txid)
    pathTxids.add(txid)
    const node = nodeByTxid.get(txid)
    for (const parentTxid of node?.spends ?? []) {
      stack.push(parentTxid)
    }
  }
}

export function layoutBarkExitGraph(params: {
  nodes: BarkExitGraphNode[]
  layoutDirection: UnilateralExitLayoutDirection
  focusedNodeId?: string | null
  exitRows?: BarkEmergencyExitRow[]
  unfundedParentTxids?: readonly string[]
}): { nodes: Node<BarkExitTreeNodeData>[]; edgePaths: BarkExitGraphEdgePath[] } {
  const {
    nodes: graphNodes,
    layoutDirection,
    focusedNodeId = null,
    exitRows = [],
    unfundedParentTxids = [],
  } = params
  const unfundedParentTxidSet = new Set(unfundedParentTxids)
  if (graphNodes.length === 0) {
    return { nodes: [], edgePaths: [] }
  }

  const pathTxids = barkExitPathTxids(graphNodes)
  const realLinks = graphNodes.flatMap((node) =>
    node.spends.map((parentTxid) => [parentTxid, node.txid] as const),
  )
  const linkedTxids = new Set(realLinks.flat())
  const singleLinks = graphNodes
    .filter((node) => !linkedTxids.has(node.txid))
    .map((node) => [node.txid, node.txid] as const)
  const graph = graphConnect().single(true)([...realLinks, ...singleLinks])
  const layout = sugiyama()
    .layering(layeringSimplex())
    .decross(decrossTwoLayer())
    .coord(coordSimplex())
    .nodeSize([BARK_EXIT_LAYOUT_NODE_SIZE_PX, BARK_EXIT_LAYOUT_NODE_SIZE_PX])
  layout(graph)

  const { sourcePosition, targetPosition } = resolveNodeConnectionPositions(layoutDirection)
  const nodePositionById = new Map<string, { x: number; y: number }>()
  const laidOutNodes: Node<BarkExitTreeNodeData>[] = []

  for (const dagNode of graph.nodes()) {
    const txid = String(dagNode.data)
    const graphNode = graphNodes.find((node) => node.txid === txid)
    if (graphNode == null) continue
    const { x, y } = layoutPosition(dagNode.x ?? 0, dagNode.y ?? 0, layoutDirection)
    nodePositionById.set(txid, { x, y })
    laidOutNodes.push({
      id: txid,
      type: 'barkExitTreeNode',
      position: { x, y },
      width: BARK_EXIT_NODE_DIAMETER_PX,
      height: BARK_EXIT_NODE_DIAMETER_PX,
      sourcePosition,
      targetPosition,
      data: {
        txid,
        txType: graphNode.txType,
        status: graphNode.status,
        phase: resolveBarkExitNodePhase({
          status: graphNode.status,
          needsChild: graphNode.needsChild,
          txid,
          unfundedParentTxids: unfundedParentTxidSet,
        }),
        isOnExitPath: pathTxids.has(txid),
        isLeaf: graphNode.leafVtxoIds.length > 0,
        leafVtxoCount: graphNode.leafVtxoIds.length,
        coinStage: resolveBarkLeafCoinStage({
          leafVtxoIds: graphNode.leafVtxoIds,
          status: graphNode.status,
          exitRows,
        }),
        isFocused: focusedNodeId === txid,
        layoutDirection,
      },
    })
  }

  const edgePaths = realLinks.flatMap(([source, target]) => {
    const sourceCenter = nodePositionById.get(source)
    const targetCenter = nodePositionById.get(target)
    if (sourceCenter == null || targetCenter == null) return []
    const sourcePoint = connectionPointFromNodeCenter(sourceCenter, sourcePosition)
    const targetPoint = connectionPointFromNodeCenter(targetCenter, targetPosition)
    const [path] = getSmoothStepPath({
      sourceX: sourcePoint.x,
      sourceY: sourcePoint.y,
      sourcePosition,
      targetX: targetPoint.x,
      targetY: targetPoint.y,
      targetPosition,
    })
    const onPath = pathTxids.has(source) && pathTxids.has(target)
    return [
      {
        id: `${source}->${target}`,
        path,
        animated: onPath,
        stroke: onPath ? EXIT_GRAPH_PATH_EDGE_COLOR : EXIT_GRAPH_DEFAULT_EDGE_COLOR,
        strokeWidth: onPath ? EXIT_GRAPH_PATH_STROKE_WIDTH : EXIT_GRAPH_DEFAULT_STROKE_WIDTH,
      },
    ]
  })

  return { nodes: laidOutNodes, edgePaths }
}

function layoutPosition(
  layoutX: number,
  layoutY: number,
  layoutDirection: UnilateralExitLayoutDirection,
): { x: number; y: number } {
  if (layoutDirection === 'LR') {
    return { x: layoutY, y: layoutX }
  }
  return { x: layoutX, y: layoutY }
}

