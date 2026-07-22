import {
  decrossTwoLayer,
  graphConnect,
  layeringSimplex,
  sugiyama,
  coordSimplex,
} from 'd3-dag'
import type { Edge, Node } from '@xyflow/react'
import type {
  ArkadeUnilateralExitNodeStatus,
  ArkadeUnilateralExitTopology,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import { includesArkadeVtxoOutpoint } from '@/workers/arkade-api'

export type UnilateralExitLayoutDirection = 'LR' | 'TB'

export type UnilateralExitTreeNodeData = {
  txid: string
  vout: number | null
  txType: string
  isLeaf: boolean
  isSelectedLeaf: boolean
  isOnExitPath: boolean
  isFocused: boolean
  status: ArkadeUnilateralExitNodeStatus['status']
  confirmations: number
}

/** Rendered node diameter in px (`size-12`). */
export const UNILATERAL_EXIT_NODE_DIAMETER_PX = 48

/**
 * Dag layout cell size: center-to-center spacing is 2× diameter so adjacent nodes
 * stay at least one radius apart (including highlight rings).
 */
const UNILATERAL_EXIT_LAYOUT_NODE_SIZE_PX = UNILATERAL_EXIT_NODE_DIAMETER_PX * 2

const EXIT_PATH_EDGE_COLOR = '#3b82f6'

export function shortTxid(txid: string): string {
  if (txid.length <= 16) return txid
  return `${txid.slice(0, 8)}…${txid.slice(-6)}`
}

export function leafOutpointNodeId(outpoint: ArkadeVtxoOutpoint): string {
  return `${outpoint.txid}:${outpoint.vout}`
}

export function parseUnilateralExitNodeId(nodeId: string): { txid: string; vout: number | null } {
  const colonIndex = nodeId.lastIndexOf(':')
  if (colonIndex === -1) {
    return { txid: nodeId, vout: null }
  }
  const txid = nodeId.slice(0, colonIndex)
  const vout = Number(nodeId.slice(colonIndex + 1))
  if (Number.isInteger(vout) && vout >= 0) {
    return { txid, vout }
  }
  return { txid: nodeId, vout: null }
}

function groupLeafOutpointsByTxid(
  leafOutpoints: ArkadeVtxoOutpoint[],
): Map<string, ArkadeVtxoOutpoint[]> {
  const grouped = new Map<string, ArkadeVtxoOutpoint[]>()
  for (const leafOutpoint of leafOutpoints) {
    const siblings = grouped.get(leafOutpoint.txid) ?? []
    siblings.push(leafOutpoint)
    grouped.set(leafOutpoint.txid, siblings)
  }
  for (const siblings of grouped.values()) {
    siblings.sort((left, right) => left.vout - right.vout)
  }
  return grouped
}

function layoutPosition(params: {
  layoutX: number
  layoutY: number
  layoutDirection: UnilateralExitLayoutDirection
  spreadIndex: number
  spreadCount: number
}): { x: number; y: number } {
  const { layoutX, layoutY, layoutDirection, spreadIndex, spreadCount } = params
  const spreadOffset =
    (spreadIndex - (spreadCount - 1) / 2) * UNILATERAL_EXIT_LAYOUT_NODE_SIZE_PX
  if (layoutDirection === 'LR') {
    return { x: layoutY, y: layoutX + spreadOffset }
  }
  return { x: layoutX + spreadOffset, y: layoutY }
}

export function computeExitPathTxids(
  topology: ArkadeUnilateralExitTopology,
  selectedLeafOutpoints: ArkadeVtxoOutpoint[],
): Set<string> {
  const nodeByTxid = new Map(topology.nodes.map((node) => [node.txid, node]))
  const pathTxids = new Set<string>()

  for (const leaf of selectedLeafOutpoints) {
    const leafTxid = leaf.txid
    if (!nodeByTxid.has(leafTxid)) {
      pathTxids.add(leafTxid)
    }
    let currentTxid: string | undefined = leafTxid
    const visited = new Set<string>()
    while (currentTxid != null && !visited.has(currentTxid)) {
      visited.add(currentTxid)
      pathTxids.add(currentTxid)
      const node = nodeByTxid.get(currentTxid)
      if (node == null || node.spends.length === 0) {
        break
      }
      currentTxid = node.spends[0]
    }
  }

  return pathTxids
}

export function mergeNodeStatuses(
  topology: ArkadeUnilateralExitTopology,
  nodeStatuses: ArkadeUnilateralExitNodeStatus[],
): Map<string, ArkadeUnilateralExitNodeStatus> {
  const statusByTxid = new Map(nodeStatuses.map((status) => [status.txid, status]))
  for (const node of topology.nodes) {
    if (!statusByTxid.has(node.txid)) {
      statusByTxid.set(node.txid, {
        txid: node.txid,
        confirmations: 0,
        status: 'pending',
      })
    }
  }
  return statusByTxid
}

export function layoutUnilateralExitGraph(params: {
  topology: ArkadeUnilateralExitTopology
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  nodeStatuses: ArkadeUnilateralExitNodeStatus[]
  layoutDirection: UnilateralExitLayoutDirection
  focusedNodeId?: string | null
}): { nodes: Node<UnilateralExitTreeNodeData>[]; edges: Edge[] } {
  const { topology, selectedLeafOutpoints, nodeStatuses, layoutDirection, focusedNodeId } = params
  const pathTxids = computeExitPathTxids(topology, selectedLeafOutpoints)
  const statusByTxid = mergeNodeStatuses(topology, nodeStatuses)
  const leafOutpointsByTxid = groupLeafOutpointsByTxid(topology.leafOutpoints)

  const graphLinks = topology.nodes.flatMap((node) =>
    node.spends.map((parentTxid) => [parentTxid, node.txid] as const),
  )

  if (graphLinks.length === 0 && topology.nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const graph = graphConnect()(graphLinks)
  const layout = sugiyama()
    .layering(layeringSimplex())
    .decross(decrossTwoLayer())
    .coord(coordSimplex())
    .nodeSize([
      UNILATERAL_EXIT_LAYOUT_NODE_SIZE_PX,
      UNILATERAL_EXIT_LAYOUT_NODE_SIZE_PX,
    ])

  layout(graph)

  const dagPositionByTxid = new Map<string, { layoutX: number; layoutY: number }>()
  for (const dagNode of graph.nodes()) {
    dagPositionByTxid.set(String(dagNode.data), {
      layoutX: dagNode.x ?? 0,
      layoutY: dagNode.y ?? 0,
    })
  }

  const nodes: Node<UnilateralExitTreeNodeData>[] = []

  for (const dagNode of graph.nodes()) {
    const txid = String(dagNode.data)
    if (leafOutpointsByTxid.has(txid)) {
      continue
    }

    const topologyNode = topology.nodes.find((node) => node.txid === txid)
    const status = statusByTxid.get(txid)
    const dagPosition = dagPositionByTxid.get(txid) ?? { layoutX: 0, layoutY: 0 }
    const { x, y } = layoutPosition({
      layoutX: dagPosition.layoutX,
      layoutY: dagPosition.layoutY,
      layoutDirection,
      spreadIndex: 0,
      spreadCount: 1,
    })

    nodes.push({
      id: txid,
      type: 'unilateralExitTreeNode',
      position: { x, y },
      data: buildTreeNodeData({
        nodeId: txid,
        txid,
        vout: null,
        txType: topologyNode?.txType ?? 'unknown',
        isLeaf: false,
        selectedLeafOutpoints,
        pathTxids,
        focusedNodeId,
        status,
      }),
    })
  }

  for (const [txid, leafOutpoints] of leafOutpointsByTxid) {
    const topologyNode = topology.nodes.find((node) => node.txid === txid)
    const status = statusByTxid.get(txid)
    const dagPosition = dagPositionByTxid.get(txid) ?? { layoutX: 0, layoutY: 0 }

    leafOutpoints.forEach((leafOutpoint, spreadIndex) => {
      const nodeId = leafOutpointNodeId(leafOutpoint)
      const { x, y } = layoutPosition({
        layoutX: dagPosition.layoutX,
        layoutY: dagPosition.layoutY,
        layoutDirection,
        spreadIndex,
        spreadCount: leafOutpoints.length,
      })

      nodes.push({
        id: nodeId,
        type: 'unilateralExitTreeNode',
        position: { x, y },
        data: buildTreeNodeData({
          nodeId,
          txid,
          vout: leafOutpoint.vout,
          txType: topologyNode?.txType ?? 'unknown',
          isLeaf: true,
          selectedLeafOutpoints,
          pathTxids,
          focusedNodeId,
          status,
        }),
      })
    })
  }

  const edges: Edge[] = graphLinks.flatMap(([source, target]) => {
    const targetOutpoints = leafOutpointsByTxid.get(target)
    const resolvedTargets =
      targetOutpoints != null
        ? targetOutpoints.map((outpoint) => leafOutpointNodeId(outpoint))
        : [target]

    return resolvedTargets.map((resolvedTarget) => {
      const onPath = pathTxids.has(source) && pathTxids.has(target)
      return {
        id: `${source}->${resolvedTarget}`,
        source,
        target: resolvedTarget,
        animated: onPath,
        style: {
          stroke: onPath ? EXIT_PATH_EDGE_COLOR : undefined,
          strokeWidth: onPath ? 2 : 1,
        },
      }
    })
  })

  return { nodes, edges }
}

function buildTreeNodeData(params: {
  nodeId: string
  txid: string
  vout: number | null
  txType: string
  isLeaf: boolean
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  pathTxids: Set<string>
  focusedNodeId?: string | null
  status: ArkadeUnilateralExitNodeStatus | undefined
}): UnilateralExitTreeNodeData {
  const leafOutpoint =
    params.isLeaf && params.vout != null
      ? { txid: params.txid, vout: params.vout }
      : null

  return {
    txid: params.txid,
    vout: params.vout,
    txType: params.txType,
    isLeaf: params.isLeaf,
    isSelectedLeaf:
      leafOutpoint != null &&
      includesArkadeVtxoOutpoint(params.selectedLeafOutpoints, leafOutpoint),
    isOnExitPath: params.pathTxids.has(params.txid),
    isFocused: params.focusedNodeId === params.nodeId,
    status: params.status?.status ?? 'pending',
    confirmations: params.status?.confirmations ?? 0,
  }
}

export function formatTreeNodeLabel(txid: string, txType: string): string {
  return `${txType} · ${shortTxid(txid)}`
}

export function resolveLayoutDirection(
  containerWidth: number,
  containerHeight: number,
): UnilateralExitLayoutDirection {
  return containerWidth > containerHeight ? 'LR' : 'TB'
}
