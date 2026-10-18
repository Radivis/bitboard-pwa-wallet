import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Check, Megaphone, Pickaxe, Wallet, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { BarkExitTreeEdgesOverlay } from '@/components/bark/BarkExitTreeEdgesOverlay'
import { ExitTreeCoinBadge } from '@/components/wallet/unilateral-exit/ExitTreeCoinBadge'
import { ExitTreeInProgressBadge } from '@/components/wallet/unilateral-exit/ExitTreeInProgressBadge'
import {
  formatUnilateralExitTxTypeLabel,
  resolveUnilateralExitNodeIconKind,
  unilateralExitNodeIconComponent,
} from '@/lib/arkade/unilateral-exit-node-icons'
import {
  barkExitNodePhaseLabel,
  BARK_EXIT_NODE_PHASE,
  layoutBarkExitGraph,
  resolveBarkExitNodePhase,
  resolveLayoutDirection,
  shortTxid,
  type BarkExitNodePhase,
  type BarkExitTreeNodeData,
} from '@/lib/bark/bark-exit-graph-layout'
import { cn } from '@/lib/shared/utils'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
import type {
  BarkEmergencyExitRow,
  BarkExitGraphNode,
  BarkExitGraphNodeStatus,
  BarkVtxoRow,
} from '@/workers/bark-api'

interface BarkExitTreeGraphProps {
  nodes: BarkExitGraphNode[] | undefined
  exitRows: BarkEmergencyExitRow[]
  emptySelection: boolean
  errorMessage: string | null
  vtxoRows: BarkVtxoRow[]
  unfundedParentTxids: readonly string[]
}

const GRAPH_CONTROLS_STYLE = {
  '--xy-controls-button-background-color': 'var(--background)',
  '--xy-controls-button-background-color-hover': 'var(--accent)',
  '--xy-controls-button-border-color': 'var(--border)',
  '--xy-controls-button-color': 'var(--foreground)',
  '--xy-controls-button-color-hover': 'var(--foreground)',
} as CSSProperties

function barkExitPhaseIcon(phase: BarkExitNodePhase): LucideIcon | null {
  switch (phase) {
    case BARK_EXIT_NODE_PHASE.awaitingBumperFunding:
      return Wallet
    case BARK_EXIT_NODE_PHASE.awaitingCpfpBroadcast:
      return Megaphone
    case BARK_EXIT_NODE_PHASE.awaitingConfirmation:
      return Pickaxe
    default:
      return null
  }
}

function barkExitPhaseIconName(phase: BarkExitNodePhase): string | undefined {
  switch (phase) {
    case BARK_EXIT_NODE_PHASE.awaitingBumperFunding:
      return 'wallet'
    case BARK_EXIT_NODE_PHASE.awaitingCpfpBroadcast:
      return 'megaphone'
    case BARK_EXIT_NODE_PHASE.awaitingConfirmation:
      return 'pickaxe'
    default:
      return undefined
  }
}

function statusLabel(status: BarkExitGraphNodeStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'inProgress':
      return 'In progress'
    case 'confirmed':
      return 'Confirmed'
  }
}

function BarkExitTreeNode({ data }: NodeProps<Node<BarkExitTreeNodeData>>) {
  const iconKind = resolveUnilateralExitNodeIconKind({
    txType: data.txType,
    isLeaf: data.isLeaf,
  })
  const Icon = unilateralExitNodeIconComponent(iconKind)
  const typeLabel = formatUnilateralExitTxTypeLabel(data.txType, data.isLeaf)
  const phaseIcon = barkExitPhaseIcon(data.phase)
  const phaseLabel = barkExitNodePhaseLabel(data.phase) ?? undefined
  return (
    <div
      className={cn(
        'relative flex size-12 items-center justify-center rounded-full border-2 bg-background shadow-sm',
        data.isOnExitPath ? 'border-blue-500' : 'border-muted-foreground/25',
        data.isFocused && 'ring-2 ring-blue-300 ring-offset-2 ring-offset-background',
      )}
      data-testid={`bark-exit-tree-node-${data.txid}`}
      data-status={data.status}
      data-icon={iconKind}
      aria-label={`${shortTxid(data.txid)}, ${statusLabel(data.status)}, ${typeLabel}`}
    >
      <Icon className="size-5" aria-hidden />
      <ExitTreeCoinBadge
        count={data.leafVtxoCount}
        stage={data.coinStage}
        testIdPrefix="bark-exit-tree"
        testIdSuffix={data.txid}
      />
      {data.phase === BARK_EXIT_NODE_PHASE.confirmed && (
        <Check
          className="absolute -right-1 -top-1 size-4 rounded-full bg-background text-green-600"
          data-testid={`bark-exit-tree-phase-confirmed-${data.txid}`}
          aria-label="Confirmed"
        />
      )}
      {phaseIcon != null && (
        <ExitTreeInProgressBadge
          icon={phaseIcon}
          iconName={barkExitPhaseIconName(data.phase)}
          label={phaseLabel}
          testId={`bark-exit-tree-phase-${data.phase}-${data.txid}`}
        />
      )}
    </div>
  )
}

const nodeTypes = {
  barkExitTreeNode: BarkExitTreeNode,
}

function BarkExitTreeCanvas({
  graphNodes,
  exitRows,
  layoutDirection,
  focusedTxid,
  unfundedParentTxids,
  onFocus,
}: {
  graphNodes: BarkExitGraphNode[]
  exitRows: BarkEmergencyExitRow[]
  layoutDirection: 'LR' | 'TB'
  focusedTxid: string | null
  unfundedParentTxids: readonly string[]
  onFocus: (txid: string) => void
}) {
  const { nodes, edgePaths } = useMemo(
    () =>
      layoutBarkExitGraph({
        nodes: graphNodes,
        layoutDirection,
        focusedNodeId: focusedTxid,
        exitRows,
        unfundedParentTxids,
      }),
    [graphNodes, layoutDirection, focusedTxid, exitRows, unfundedParentTxids],
  )

  return (
    <ReactFlow
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
        onFocus(node.id)
      }}
      proOptions={{ hideAttribution: true }}
    >
      <BarkExitTreeEdgesOverlay edgePaths={edgePaths} />
      <Background />
      <Controls showInteractive={false} style={GRAPH_CONTROLS_STYLE} />
    </ReactFlow>
  )
}

function BarkExitTreeDetail({
  node,
  vtxoRows,
  unfundedParentTxids,
}: {
  node: BarkExitGraphNode
  vtxoRows: BarkVtxoRow[]
  unfundedParentTxids: readonly string[]
}) {
  async function copyTxid() {
    await navigator.clipboard.writeText(node.txid)
    toast.success('Exit transaction id copied')
  }

  const phaseLabel = barkExitNodePhaseLabel(
    resolveBarkExitNodePhase({
      status: node.status,
      needsChild: node.needsChild,
      txid: node.txid,
      unfundedParentTxids: new Set(unfundedParentTxids),
    }),
  )

  return (
    <div className="space-y-2 text-sm" data-testid="bark-exit-tree-detail">
      <button
        type="button"
        className="break-all text-left font-mono text-primary underline-offset-4 hover:underline"
        data-testid="bark-exit-tree-detail-txid"
        onClick={() => void copyTxid()}
      >
        {node.txid}
      </button>
      <p data-testid="bark-exit-tree-detail-status">
        {formatUnilateralExitTxTypeLabel(node.txType, node.leafVtxoIds.length > 0)}
        {' · '}
        {statusLabel(node.status)}
      </p>
      {phaseLabel != null ? (
        <p data-testid="bark-exit-tree-detail-phase">{phaseLabel}</p>
      ) : null}
      {node.waitingOnTxids.length > 0 ? (
        <p data-testid="bark-exit-tree-detail-waiting">
          Waiting on {node.waitingOnTxids.join(', ')}
        </p>
      ) : null}
      {node.leafVtxoIds.length > 0 ? (
        <ul className="space-y-1" data-testid="bark-exit-tree-detail-leaves">
          {node.leafVtxoIds.map((vtxoId) => {
            const row = vtxoRows.find((candidate) => candidate.id === vtxoId)
            return (
              <li key={vtxoId} data-testid={`bark-exit-tree-detail-vtxo-${vtxoId}`}>
                <span className="font-mono">{vtxoId}</span>
                {row == null ? null : <span> · {formatSats(row.amountSats)}</span>}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export function BarkExitTreeGraph({
  nodes,
  exitRows,
  emptySelection,
  errorMessage,
  vtxoRows,
  unfundedParentTxids,
}: BarkExitTreeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [layoutDirection, setLayoutDirection] = useState<'LR' | 'TB'>('TB')
  const [focusedTxid, setFocusedTxid] = useState<string | null>(null)
  const focusedNode = nodes?.find((node) => node.txid === focusedTxid) ?? null

  useEffect(() => {
    const element = containerRef.current
    if (element == null || typeof ResizeObserver === 'undefined') return
    const updateLayoutDirection = () => {
      const { width, height } = element.getBoundingClientRect()
      setLayoutDirection(resolveLayoutDirection(width, height))
    }
    updateLayoutDirection()
    const observer = new ResizeObserver(updateLayoutDirection)
    observer.observe(element)
    return () => observer.disconnect()
  }, [nodes])

  const testId =
    errorMessage != null
      ? 'bark-exit-tree-error'
      : emptySelection || nodes?.length === 0
        ? 'bark-exit-tree-empty'
        : nodes == null
          ? 'bark-exit-tree-loading'
          : 'bark-exit-tree-graph'

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="h-[min(480px,55vh)] min-h-[320px] w-full rounded-md border"
        data-testid={testId}
      >
        {errorMessage != null ? (
          <div className="flex h-full items-center justify-center bg-muted/20 px-4">
            <p className="text-sm text-destructive">{errorMessage}</p>
          </div>
        ) : emptySelection || nodes?.length === 0 ? (
          <div className="flex h-full items-center justify-center bg-muted/20 px-4">
            <p className="text-sm text-muted-foreground">
              {emptySelection
                ? 'Select spendable VTXOs to see their exit tree.'
                : 'No exit transactions for this selection.'}
            </p>
          </div>
        ) : nodes == null ? (
          <div className="flex h-full items-center justify-center bg-muted/20">
            <p className="text-sm text-muted-foreground">Loading exit tree…</p>
          </div>
        ) : (
          <div className="h-full w-full">
            <ReactFlowProvider>
              <BarkExitTreeCanvas
                graphNodes={nodes}
                exitRows={exitRows}
                layoutDirection={layoutDirection}
                focusedTxid={focusedTxid}
                unfundedParentTxids={unfundedParentTxids}
                onFocus={setFocusedTxid}
              />
            </ReactFlowProvider>
          </div>
        )}
      </div>
      {focusedNode != null ? (
        <BarkExitTreeDetail
          node={focusedNode}
          vtxoRows={vtxoRows}
          unfundedParentTxids={unfundedParentTxids}
        />
      ) : null}
    </div>
  )
}
