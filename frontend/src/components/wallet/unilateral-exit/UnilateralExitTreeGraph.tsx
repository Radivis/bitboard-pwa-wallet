import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Check, Coins, Loader2, Megaphone, Pickaxe, type LucideIcon } from 'lucide-react'
import type { UnilateralExitInProgressOverlayKind } from '@/lib/arkade/unilateral-exit-control-phase'
import {
  layoutUnilateralExitGraph,
  resolveLayoutDirection,
  type UnilateralExitTreeNodeData,
} from '@/lib/arkade/unilateral-exit-topology'
import {
  resolveUnilateralExitNodeIconKind,
  unilateralExitNodeIconComponent,
} from '@/lib/arkade/unilateral-exit-node-icons'
import type {
  ArkadeUnilateralExitNodeStatus,
  ArkadeUnilateralExitTopology,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import { cn } from '@/lib/shared/utils'
import { UnilateralExitTreeEdgesOverlay } from '@/components/wallet/unilateral-exit/UnilateralExitTreeEdgesOverlay'

interface UnilateralExitTreeGraphProps {
  renderEpoch: number
  topology: ArkadeUnilateralExitTopology | undefined
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  nodeStatuses: ArkadeUnilateralExitNodeStatus[]
  inProgressOverlay: UnilateralExitInProgressOverlayKind | null
  focusedNodeId: string | null
  onNodeFocus: (nodeId: string) => void
}

function unilateralExitInProgressOverlayIcon(
  overlay: UnilateralExitInProgressOverlayKind,
): LucideIcon {
  switch (overlay) {
    case 'ensuringBroadcast':
      return Megaphone
    case 'waiting':
      return Pickaxe
  }
}

function UnilateralExitInProgressBadge({
  overlay,
}: {
  overlay: UnilateralExitInProgressOverlayKind | null
}) {
  const OverlayIcon = overlay == null ? null : unilateralExitInProgressOverlayIcon(overlay)

  return (
    <div
      className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-background"
      data-testid={
        overlay == null ? 'unilateral-exit-in-progress' : `unilateral-exit-in-progress-${overlay}`
      }
      aria-hidden
    >
      <Loader2 className="absolute size-5 animate-spin text-blue-600" />
      {OverlayIcon != null && (
        <OverlayIcon className="relative z-10 size-2.5 text-blue-700" strokeWidth={2.5} />
      )}
    </div>
  )
}

function UnilateralExitTreeNode({
  data,
}: NodeProps<Node<UnilateralExitTreeNodeData>>) {
  const iconKind = resolveUnilateralExitNodeIconKind({
    txType: data.txType,
    isLeaf: data.isLeaf,
  })
  const Icon = unilateralExitNodeIconComponent(iconKind)
  const nodeTestId = data.isLeaf
    ? `unilateral-exit-leaf-node-${data.txid.slice(0, 8)}`
    : `unilateral-exit-node-${data.txid.slice(0, 8)}`

  return (
    <div
      className={cn(
        'relative flex size-12 items-center justify-center rounded-full border-2 bg-background shadow-sm',
        data.isOnExitPath ? 'border-blue-500' : 'border-muted-foreground/25',
        data.isFocused && 'ring-2 ring-blue-300 ring-offset-2 ring-offset-background',
        data.isSelectedLeaf && 'bg-blue-50 dark:bg-blue-950/30',
      )}
      data-testid={nodeTestId}
      aria-label={`${data.txType} node`}
    >
      <Icon className="size-5 text-foreground" aria-hidden />
      {data.exitableVtxoCount > 0 && (
        <div
          className="absolute left-1/2 top-[calc(50%+10px)] flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-background px-0.5 text-amber-600 shadow-sm"
          aria-label={`${data.exitableVtxoCount} exitable VTXO${data.exitableVtxoCount === 1 ? '' : 's'}`}
          data-testid={`unilateral-exit-vtxo-count-${data.txid.slice(0, 8)}`}
        >
          {data.exitableVtxoCount > 1 && (
            <span className="text-[10px] font-semibold leading-none">
              {data.exitableVtxoCount}×
            </span>
          )}
          <Coins className="size-3" aria-hidden />
        </div>
      )}
      {data.status === 'confirmed' && (
        <Check
          className="absolute -right-1 -top-1 size-4 rounded-full bg-background text-green-600"
          aria-hidden
        />
      )}
      {data.status === 'inProgress' && (
        <UnilateralExitInProgressBadge overlay={data.inProgressOverlay} />
      )}
    </div>
  )
}

const nodeTypes = {
  unilateralExitTreeNode: UnilateralExitTreeNode,
}

function UnilateralExitTreeGraphCanvas({
  renderEpoch,
  topology,
  selectedLeafOutpoints,
  nodeStatuses,
  inProgressOverlay,
  focusedNodeId,
  onNodeFocus,
  layoutDirection,
}: UnilateralExitTreeGraphProps & { layoutDirection: 'LR' | 'TB' }) {
  const { nodes, edgePaths } = useMemo(
    () =>
      layoutUnilateralExitGraph({
        topology: topology!,
        selectedLeafOutpoints,
        nodeStatuses,
        inProgressOverlay,
        layoutDirection,
        focusedNodeId,
      }),
    [
      topology,
      selectedLeafOutpoints,
      nodeStatuses,
      inProgressOverlay,
      layoutDirection,
      focusedNodeId,
    ],
  )

  return (
    <ReactFlow
      key={renderEpoch}
      className="h-full w-full"
      nodes={nodes}
      edges={[]}
      nodeTypes={nodeTypes}
      nodeOrigin={[0.5, 0.5]}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      onNodeClick={(_, node) => {
        onNodeFocus(node.id)
      }}
      proOptions={{ hideAttribution: true }}
    >
      <UnilateralExitTreeEdgesOverlay edgePaths={edgePaths} />
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

export function UnilateralExitTreeGraph({
  renderEpoch,
  topology,
  selectedLeafOutpoints,
  nodeStatuses,
  inProgressOverlay,
  focusedNodeId,
  onNodeFocus,
}: UnilateralExitTreeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [layoutDirection, setLayoutDirection] = useState<'LR' | 'TB'>('TB')

  useEffect(() => {
    const element = containerRef.current
    if (element == null) return

    const updateLayoutDirection = () => {
      const { width, height } = element.getBoundingClientRect()
      setLayoutDirection(resolveLayoutDirection(width, height))
    }

    updateLayoutDirection()
    const observer = new ResizeObserver(updateLayoutDirection)
    observer.observe(element)
    return () => observer.disconnect()
  }, [topology])

  return (
    <div
      ref={containerRef}
      className="h-[min(480px,55vh)] min-h-[320px] w-full rounded-md border"
      data-testid={
        topology == null
          ? 'unilateral-exit-tree-loading'
          : topology.nodes.length === 0
            ? 'unilateral-exit-tree-empty'
            : 'unilateral-exit-tree-graph'
      }
    >
      {topology == null ? (
        <div className="flex h-full items-center justify-center bg-muted/20">
          <p className="text-sm text-muted-foreground">Loading exit tree…</p>
        </div>
      ) : topology.nodes.length === 0 ? (
        <div className="flex h-full items-center justify-center bg-muted/20">
          <p className="text-sm text-muted-foreground">No exit topology available.</p>
        </div>
      ) : (
        <div className="h-full w-full">
          <ReactFlowProvider>
            <UnilateralExitTreeGraphCanvas
              renderEpoch={renderEpoch}
              topology={topology}
              selectedLeafOutpoints={selectedLeafOutpoints}
              nodeStatuses={nodeStatuses}
              inProgressOverlay={inProgressOverlay}
              focusedNodeId={focusedNodeId}
              onNodeFocus={onNodeFocus}
              layoutDirection={layoutDirection}
            />
          </ReactFlowProvider>
        </div>
      )}
    </div>
  )
}
