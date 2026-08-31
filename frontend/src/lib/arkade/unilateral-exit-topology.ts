import {
  decrossTwoLayer,
  graphConnect,
  layeringSimplex,
  sugiyama,
  coordSimplex,
} from 'd3-dag'
import type { Node } from '@xyflow/react'
import { Position, getSmoothStepPath } from '@xyflow/react'
import type { UnilateralExitInProgressOverlayKind } from '@/lib/arkade/unilateral-exit-control-phase'
import type {
  ArkadeUnilateralExitHostOutpoint,
  ArkadeUnilateralExitNodeStatus,
  ArkadeUnilateralExitTopology,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import { includesArkadeVtxoOutpoint, sortArkadeVtxoOutpoints } from '@/workers/arkade-api'

export type UnilateralExitLayoutDirection = 'LR' | 'TB'

/** Outpoints passed to topology/progress APIs: authoritative job wins; never infer from in-progress when a job is active. */
export function resolveUnilateralExitTopologyOutpoints(params: {
  /** Persisted or machine-owned job outpoints — sole source for active jobs. */
  authoritativeJobOutpoints?: ArkadeVtxoOutpoint[]
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  inProgressOutpoints: ArkadeVtxoOutpoint[]
  persistedJobOutpoints?: ArkadeVtxoOutpoint[]
}): ArkadeVtxoOutpoint[] {
  if (
    params.authoritativeJobOutpoints != null &&
    params.authoritativeJobOutpoints.length > 0
  ) {
    return sortArkadeVtxoOutpoints(params.authoritativeJobOutpoints)
  }
  if (params.selectedLeafOutpoints.length > 0) {
    return sortArkadeVtxoOutpoints(params.selectedLeafOutpoints)
  }
  if (params.persistedJobOutpoints != null && params.persistedJobOutpoints.length > 0) {
    return sortArkadeVtxoOutpoints(params.persistedJobOutpoints)
  }
  if (params.inProgressOutpoints.length > 0) {
    return sortArkadeVtxoOutpoints(params.inProgressOutpoints)
  }
  return []
}

export type UnilateralExitTreeNodeData = {
  txid: string
  vout: number | null
  txType: string
  isLeaf: boolean
  isSelectedLeaf: boolean
  isOnExitPath: boolean
  isFocused: boolean
  status: ArkadeUnilateralExitNodeStatus['status']
  inProgressOverlay: UnilateralExitInProgressOverlayKind | null
  proceedingAutomatically: boolean
  onReadyToProceed?: () => void
  readyToProceedDisabled?: boolean
  confirmations: number
  layoutDirection: UnilateralExitLayoutDirection
  exitableVtxoCount: number
}

/** Rendered node diameter in px (`size-12`). */
export const UNILATERAL_EXIT_NODE_DIAMETER_PX = 48

/**
 * Dag layout cell size: center-to-center spacing is 2× diameter so adjacent nodes
 * stay at least one radius apart (including highlight rings).
 */
const UNILATERAL_EXIT_LAYOUT_NODE_SIZE_PX = UNILATERAL_EXIT_NODE_DIAMETER_PX * 2

const EXIT_PATH_EDGE_COLOR = '#3b82f6'
const DEFAULT_EDGE_COLOR = '#94a3b8'

export type UnilateralExitGraphEdgePath = {
  id: string
  path: string
  animated: boolean
  stroke: string
  strokeWidth: number
}

export function resolveNodeConnectionPositions(layoutDirection: UnilateralExitLayoutDirection): {
  sourcePosition: Position
  targetPosition: Position
} {
  if (layoutDirection === 'LR') {
    return { sourcePosition: Position.Right, targetPosition: Position.Left }
  }
  return { sourcePosition: Position.Bottom, targetPosition: Position.Top }
}

function connectionPointFromNodeCenter(
  center: { x: number; y: number },
  side: Position,
  nodeDiameter: number = UNILATERAL_EXIT_NODE_DIAMETER_PX,
): { x: number; y: number } {
  const radius = nodeDiameter / 2
  switch (side) {
    case Position.Top:
      return { x: center.x, y: center.y - radius }
    case Position.Bottom:
      return { x: center.x, y: center.y + radius }
    case Position.Left:
      return { x: center.x - radius, y: center.y }
    case Position.Right:
      return { x: center.x + radius, y: center.y }
  }
}

function buildGraphLinks(
  topology: ArkadeUnilateralExitTopology,
): ReadonlyArray<readonly [string, string]> {
  const linksFromSpends = topology.nodes.flatMap((node) =>
    node.spends.map((parentTxid) => [parentTxid, node.txid] as const),
  )
  if (linksFromSpends.length > 0) {
    return linksFromSpends
  }

  const links: Array<readonly [string, string]> = []
  for (let index = 1; index < topology.exitBranchTxids.length; index += 1) {
    links.push([topology.exitBranchTxids[index - 1], topology.exitBranchTxids[index]])
  }
  return links
}

function buildEdgePaths(params: {
  graphLinks: ReadonlyArray<readonly [string, string]>
  nodePositionById: Map<string, { x: number; y: number }>
  layoutDirection: UnilateralExitLayoutDirection
  pathTxids: Set<string>
}): UnilateralExitGraphEdgePath[] {
  const { graphLinks, nodePositionById, layoutDirection, pathTxids } = params
  const { sourcePosition, targetPosition } = resolveNodeConnectionPositions(layoutDirection)

  return graphLinks.flatMap(([source, target]) => {
    const sourceCenter = nodePositionById.get(source)
    const targetCenter = nodePositionById.get(target)
    if (sourceCenter == null || targetCenter == null) {
      return []
    }

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
        stroke: onPath ? EXIT_PATH_EDGE_COLOR : DEFAULT_EDGE_COLOR,
        strokeWidth: onPath ? 2.5 : 1.5,
      },
    ]
  })
}

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

function groupHostOutpointsByTxid(
  hostOutpoints: ArkadeUnilateralExitHostOutpoint[],
): Map<string, ArkadeUnilateralExitHostOutpoint[]> {
  const grouped = new Map<string, ArkadeUnilateralExitHostOutpoint[]>()
  for (const hostOutpoint of hostOutpoints) {
    const siblings = grouped.get(hostOutpoint.txid) ?? []
    siblings.push(hostOutpoint)
    grouped.set(hostOutpoint.txid, siblings)
  }
  for (const siblings of grouped.values()) {
    siblings.sort((left, right) => left.vout - right.vout)
  }
  return grouped
}

export function hostOutpointsForTxid(
  topology: ArkadeUnilateralExitTopology,
  txid: string,
): ArkadeUnilateralExitHostOutpoint[] {
  return groupHostOutpointsByTxid(topology.hostOutpoints).get(txid) ?? []
}

export function leafOutpointsForTxid(
  topology: ArkadeUnilateralExitTopology,
  txid: string,
): ArkadeVtxoOutpoint[] {
  return groupLeafOutpointsByTxid(topology.leafOutpoints).get(txid) ?? []
}

function allLeafOutpointsSelected(
  leafOutpoints: ArkadeVtxoOutpoint[],
  selectedLeafOutpoints: ArkadeVtxoOutpoint[],
): boolean {
  return (
    leafOutpoints.length > 0 &&
    leafOutpoints.every((outpoint) => includesArkadeVtxoOutpoint(selectedLeafOutpoints, outpoint))
  )
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

function collectAncestorTxids(
  startTxid: string,
  nodeByTxid: Map<string, ArkadeUnilateralExitTopology['nodes'][number]>,
): Set<string> {
  const pathTxids = new Set<string>()
  const stack = [startTxid]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const txid = stack.pop()
    if (txid == null || visited.has(txid)) {
      continue
    }
    visited.add(txid)
    pathTxids.add(txid)
    const node = nodeByTxid.get(txid)
    for (const parentTxid of node?.spends ?? []) {
      stack.push(parentTxid)
    }
  }

  return pathTxids
}

export function computeExitPathTxids(
  topology: ArkadeUnilateralExitTopology,
  selectedLeafOutpoints: ArkadeVtxoOutpoint[],
): Set<string> {
  if (selectedLeafOutpoints.length === 0) {
    return new Set()
  }

  const nodeByTxid = new Map(topology.nodes.map((node) => [node.txid, node]))
  const pathTxids = new Set<string>()

  for (const leaf of selectedLeafOutpoints) {
    for (const txid of collectAncestorTxids(leaf.txid, nodeByTxid)) {
      pathTxids.add(txid)
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
  inProgressOverlay: UnilateralExitInProgressOverlayKind | null
  proceedingAutomatically?: boolean
  layoutDirection: UnilateralExitLayoutDirection
  focusedNodeId?: string | null
  onReadyToProceed?: () => void
  readyToProceedDisabled?: boolean
}): { nodes: Node<UnilateralExitTreeNodeData>[]; edgePaths: UnilateralExitGraphEdgePath[] } {
  const {
    topology,
    selectedLeafOutpoints,
    nodeStatuses,
    inProgressOverlay,
    proceedingAutomatically = false,
    layoutDirection,
    focusedNodeId,
    onReadyToProceed,
    readyToProceedDisabled,
  } = params
  const pathTxids = computeExitPathTxids(topology, selectedLeafOutpoints)
  const statusByTxid = mergeNodeStatuses(topology, nodeStatuses)
  const leafOutpointsByTxid = groupLeafOutpointsByTxid(topology.leafOutpoints)
  const hostOutpointsByTxid = groupHostOutpointsByTxid(topology.hostOutpoints)

  const graphLinks = buildGraphLinks(topology)

  if (graphLinks.length === 0 && topology.nodes.length === 0) {
    return { nodes: [], edgePaths: [] }
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

  const { sourcePosition, targetPosition } = resolveNodeConnectionPositions(layoutDirection)

  const nodes: Node<UnilateralExitTreeNodeData>[] = []
  const nodePositionById = new Map<string, { x: number; y: number }>()

  for (const dagNode of graph.nodes()) {
    const txid = String(dagNode.data)
    const leafOutpoints = leafOutpointsByTxid.get(txid) ?? []
    const hostOutpoints = hostOutpointsByTxid.get(txid) ?? []
    const isLeaf = leafOutpoints.length > 0
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
    nodePositionById.set(txid, { x, y })

    nodes.push({
      id: txid,
      type: 'unilateralExitTreeNode',
      position: { x, y },
      width: UNILATERAL_EXIT_NODE_DIAMETER_PX,
      height: UNILATERAL_EXIT_NODE_DIAMETER_PX,
      sourcePosition,
      targetPosition,
      data: buildTreeNodeData({
        nodeId: txid,
        txid,
        vout: null,
        txType: topologyNode?.txType ?? 'unknown',
        isLeaf,
        isSelectedLeaf: allLeafOutpointsSelected(leafOutpoints, selectedLeafOutpoints),
        exitableVtxoCount: hostOutpoints.length,
        pathTxids,
        focusedNodeId,
        status,
        inProgressOverlay,
        proceedingAutomatically,
        onReadyToProceed,
        readyToProceedDisabled,
        layoutDirection,
      }),
    })
  }

  const edgePaths = buildEdgePaths({
    graphLinks,
    nodePositionById,
    layoutDirection,
    pathTxids,
  })

  return { nodes, edgePaths }
}

function buildTreeNodeData(params: {
  nodeId: string
  txid: string
  vout: number | null
  txType: string
  isLeaf: boolean
  isSelectedLeaf: boolean
  exitableVtxoCount: number
  pathTxids: Set<string>
  focusedNodeId?: string | null
  status: ArkadeUnilateralExitNodeStatus | undefined
  inProgressOverlay: UnilateralExitInProgressOverlayKind | null
  proceedingAutomatically: boolean
  onReadyToProceed?: () => void
  readyToProceedDisabled?: boolean
  layoutDirection: UnilateralExitLayoutDirection
}): UnilateralExitTreeNodeData {
  const nodeStatus = params.status?.status ?? 'pending'
  const overlay = nodeStatus === 'inProgress' ? params.inProgressOverlay : null
  return {
    txid: params.txid,
    vout: params.vout,
    txType: params.txType,
    isLeaf: params.isLeaf,
    isSelectedLeaf: params.isSelectedLeaf,
    isOnExitPath: params.pathTxids.has(params.txid),
    isFocused: params.focusedNodeId === params.nodeId,
    status: nodeStatus,
    inProgressOverlay: overlay,
    proceedingAutomatically:
      overlay != null && overlay !== 'readyToProceed'
        ? params.proceedingAutomatically
        : false,
    onReadyToProceed:
      overlay === 'readyToProceed' ? params.onReadyToProceed : undefined,
    readyToProceedDisabled:
      overlay === 'readyToProceed' ? params.readyToProceedDisabled : undefined,
    confirmations: params.status?.confirmations ?? 0,
    layoutDirection: params.layoutDirection,
    exitableVtxoCount: params.exitableVtxoCount,
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
