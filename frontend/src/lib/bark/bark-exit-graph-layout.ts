import {
  coordSimplex,
  decrossTwoLayer,
  graphConnect,
  layeringSimplex,
  sugiyama,
} from 'd3-dag'
import type { Node } from '@xyflow/react'
import { Position, getSmoothStepPath } from '@xyflow/react'
import {
  resolveLayoutDirection,
  resolveNodeConnectionPositions,
  shortTxid,
  type UnilateralExitLayoutDirection,
} from '@/lib/arkade/unilateral-exit-topology'
import type { BarkExitGraphNode, BarkExitGraphNodeStatus } from '@/workers/bark-api'

export { resolveLayoutDirection, shortTxid }

/** Rendered node diameter in px (`size-12`). */
export const BARK_EXIT_NODE_DIAMETER_PX = 48

const BARK_EXIT_LAYOUT_NODE_SIZE_PX = BARK_EXIT_NODE_DIAMETER_PX * 2
const EXIT_PATH_EDGE_COLOR = '#3b82f6'
const DEFAULT_EDGE_COLOR = '#94a3b8'

export type BarkExitGraphEdgePath = {
  id: string
  path: string
  animated: boolean
  stroke: string
  strokeWidth: number
}

export type BarkExitTreeNodeData = {
  txid: string
  status: BarkExitGraphNodeStatus
  needsChild: boolean
  isOnExitPath: boolean
  isLeaf: boolean
  isFocused: boolean
  layoutDirection: UnilateralExitLayoutDirection
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
}): { nodes: Node<BarkExitTreeNodeData>[]; edgePaths: BarkExitGraphEdgePath[] } {
  const { nodes: graphNodes, layoutDirection, focusedNodeId = null } = params
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
        status: graphNode.status,
        needsChild: graphNode.needsChild,
        isOnExitPath: pathTxids.has(txid),
        isLeaf: graphNode.leafVtxoIds.length > 0,
        isFocused: focusedNodeId === txid,
        layoutDirection,
      },
    })
  }

  const edgePaths = realLinks.flatMap(([source, target]) => {
    const sourceCenter = nodePositionById.get(source)
    const targetCenter = nodePositionById.get(target)
    if (sourceCenter == null || targetCenter == null) return []
    const sourcePoint = connectionPoint(sourceCenter, sourcePosition)
    const targetPoint = connectionPoint(targetCenter, targetPosition)
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
        stroke: onPath ? EXIT_PATH_EDGE_COLOR : DEFAULT_EDGE_COLOR,
        strokeWidth: onPath ? 2.5 : 1.5,
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

function connectionPoint(center: { x: number; y: number }, side: Position): { x: number; y: number } {
  const radius = BARK_EXIT_NODE_DIAMETER_PX / 2
  if (side === Position.Top) return { x: center.x, y: center.y - radius }
  if (side === Position.Bottom) return { x: center.x, y: center.y + radius }
  if (side === Position.Left) return { x: center.x - radius, y: center.y }
  return { x: center.x + radius, y: center.y }
}
