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
import { Check, Coins, HandCoins, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { BarkExitTreeEdgesOverlay } from '@/components/bark/BarkExitTreeEdgesOverlay'
import {
  formatUnilateralExitTxTypeLabel,
  resolveUnilateralExitNodeIconKind,
  unilateralExitNodeIconComponent,
} from '@/lib/arkade/unilateral-exit-node-icons'
import {
  layoutBarkExitGraph,
  resolveLayoutDirection,
  shortTxid,
  type BarkExitTreeNodeData,
} from '@/lib/bark/bark-exit-graph-layout'
import { cn } from '@/lib/shared/utils'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
import type { BarkExitGraphNode, BarkExitGraphNodeStatus, BarkVtxoRow } from '@/workers/bark-api'

interface BarkExitTreeGraphProps {
  nodes: BarkExitGraphNode[] | undefined
  emptySelection: boolean
  errorMessage: string | null
  vtxoRows: BarkVtxoRow[]
}

const GRAPH_CONTROLS_STYLE = {
  '--xy-controls-button-background-color': 'var(--background)',
  '--xy-controls-button-background-color-hover': 'var(--accent)',
  '--xy-controls-button-border-color': 'var(--border)',
  '--xy-controls-button-color': 'var(--foreground)',
  '--xy-controls-button-color-hover': 'var(--foreground)',
} as CSSProperties

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

function BarkExitCoinBadge({
  txid,
  count,
  confirmed,
}: {
  txid: string
  count: number
  confirmed: boolean
}) {
  if (count <= 0) return null
  const OverlayIcon = confirmed ? HandCoins : Coins
  const vtxoNoun = count === 1 ? 'VTXO' : 'VTXOs'
  const overlayLabel = confirmed
    ? `${count} exited ${vtxoNoun}`
    : `${count} exiting ${vtxoNoun}`
  return (
    <div
      className="absolute left-1/2 top-[calc(50%+10px)] flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-background px-0.5 text-amber-600 shadow-sm"
      aria-label={overlayLabel}
      data-testid={
        confirmed
          ? `bark-exit-tree-unrolled-vtxo-count-${txid}`
          : `bark-exit-tree-vtxo-count-${txid}`
      }
    >
      {count > 1 ? <span className="text-[10px] font-semibold leading-none">{count}×</span> : null}
      <OverlayIcon className="size-3" aria-hidden />
    </div>
  )
}

function BarkExitTreeNode({ data }: NodeProps<Node<BarkExitTreeNodeData>>) {
  const iconKind = resolveUnilateralExitNodeIconKind({
    txType: data.txType,
    isLeaf: data.isLeaf,
  })
  const Icon = unilateralExitNodeIconComponent(iconKind)
  const typeLabel = formatUnilateralExitTxTypeLabel(data.txType, data.isLeaf)
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
      <BarkExitCoinBadge
        txid={data.txid}
        count={data.leafVtxoCount}
        confirmed={data.status === 'confirmed'}
      />
      {data.status === 'confirmed' && (
        <Check
          className="absolute -right-1 -top-1 size-4 rounded-full bg-background text-green-600"
          aria-hidden
        />
      )}
      {data.status === 'inProgress' && (
        <Loader2
          className="absolute -right-1 -top-1 size-4 animate-spin text-blue-600"
          aria-hidden
        />
      )}
      {data.needsChild && (
        <span
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-background px-1 text-[9px] font-medium text-amber-700"
          data-testid={`bark-exit-tree-needs-child-${data.txid}`}
        >
          Child
        </span>
      )}
    </div>
  )
}

const nodeTypes = {
  barkExitTreeNode: BarkExitTreeNode,
}

function BarkExitTreeCanvas({
  graphNodes,
  layoutDirection,
  focusedTxid,
  onFocus,
}: {
  graphNodes: BarkExitGraphNode[]
  layoutDirection: 'LR' | 'TB'
  focusedTxid: string | null
  onFocus: (txid: string) => void
}) {
  const { nodes, edgePaths } = useMemo(
    () =>
      layoutBarkExitGraph({
        nodes: graphNodes,
        layoutDirection,
        focusedNodeId: focusedTxid,
      }),
    [graphNodes, layoutDirection, focusedTxid],
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
}: {
  node: BarkExitGraphNode
  vtxoRows: BarkVtxoRow[]
}) {
  async function copyTxid() {
    await navigator.clipboard.writeText(node.txid)
    toast.success('Exit transaction id copied')
  }

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
      {node.needsChild ? (
        <p data-testid="bark-exit-tree-detail-needs-child">Needs a Pay-to-Anchor child</p>
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
  emptySelection,
  errorMessage,
  vtxoRows,
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
                layoutDirection={layoutDirection}
                focusedTxid={focusedTxid}
                onFocus={setFocusedTxid}
              />
            </ReactFlowProvider>
          </div>
        )}
      </div>
      {focusedNode != null ? <BarkExitTreeDetail node={focusedNode} vtxoRows={vtxoRows} /> : null}
    </div>
  )
}
