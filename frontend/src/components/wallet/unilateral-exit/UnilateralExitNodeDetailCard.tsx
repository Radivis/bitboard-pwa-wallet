import { Check, Loader2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  formatUnilateralExitTxTypeLabel,
  resolveUnilateralExitNodeIconKind,
  unilateralExitNodeIconComponent,
} from '@/lib/arkade/unilateral-exit-node-icons'
import {
  parseUnilateralExitNodeId,
  shortTxid,
} from '@/lib/arkade/unilateral-exit-topology'
import { cn } from '@/lib/shared/utils'
import type {
  ArkadeExitCandidateRow,
  ArkadeUnilateralExitNodeStatus,
  ArkadeUnilateralExitTopology,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import { includesArkadeVtxoOutpoint } from '@/workers/arkade-api'

interface UnilateralExitNodeDetailCardProps {
  topology: ArkadeUnilateralExitTopology
  focusedNodeId: string
  nodeStatuses: ArkadeUnilateralExitNodeStatus[]
  exitCandidates: ArkadeExitCandidateRow[]
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  onToggleLeaf: (outpoint: ArkadeVtxoOutpoint) => void
}

function resolveNodeStatus(
  txid: string,
  nodeStatuses: ArkadeUnilateralExitNodeStatus[],
): ArkadeUnilateralExitNodeStatus {
  return (
    nodeStatuses.find((status) => status.txid === txid) ?? {
      txid,
      confirmations: 0,
      status: 'pending',
    }
  )
}

export function UnilateralExitNodeDetailCard({
  topology,
  focusedNodeId,
  nodeStatuses,
  exitCandidates,
  selectedLeafOutpoints,
  onToggleLeaf,
}: UnilateralExitNodeDetailCardProps) {
  const { txid } = parseUnilateralExitNodeId(focusedNodeId)
  const topologyNode = topology.nodes.find((node) => node.txid === txid)
  const leafOutpointsForTx = topology.leafOutpoints
    .filter((leaf) => leaf.txid === txid)
    .sort((left, right) => left.vout - right.vout)
  const isLeaf = leafOutpointsForTx.length > 0
  const txType = topologyNode?.txType ?? 'unknown'
  const status = resolveNodeStatus(txid, nodeStatuses)
  const iconKind = resolveUnilateralExitNodeIconKind({ txType, isLeaf })
  const Icon = unilateralExitNodeIconComponent(iconKind)

  const statusLabel =
    status.status === 'confirmed'
      ? 'Confirmed on chain'
      : status.status === 'inProgress'
        ? 'In progress'
        : 'Pending'

  return (
    <div
      className="rounded-md border bg-card p-4 shadow-sm"
      data-testid="unilateral-exit-node-detail"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full border-2 bg-background',
            topologyNode != null && 'border-muted-foreground/20',
          )}
        >
          <Icon className="size-5 text-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              {formatUnilateralExitTxTypeLabel(txType, isLeaf)}
            </p>
            {status.status === 'confirmed' && (
              <Check className="size-4 text-green-600" aria-label={statusLabel} />
            )}
            {status.status === 'inProgress' && (
              <Loader2 className="size-4 animate-spin text-blue-600" aria-label={statusLabel} />
            )}
          </div>
          <p className="font-mono text-xs break-all text-muted-foreground">{txid}</p>
          <p className="text-xs text-muted-foreground">
            Short id: {shortTxid(txid)} · {statusLabel}
            {status.confirmations > 0 ? ` · ${status.confirmations} conf` : ''}
          </p>
          {topologyNode != null && topologyNode.spends.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Spends: {topologyNode.spends.map((spendTxid) => shortTxid(spendTxid)).join(', ')}
            </p>
          )}
          {isLeaf && (
            <div className="space-y-2">
              {leafOutpointsForTx.map((leafOutpoint) => {
                const candidateRow = exitCandidates.find(
                  (candidate) =>
                    candidate.txid === leafOutpoint.txid &&
                    candidate.vout === leafOutpoint.vout,
                )
                const isSelectedForExit = includesArkadeVtxoOutpoint(
                  selectedLeafOutpoints,
                  leafOutpoint,
                )
                const switchId = `unilateral-exit-leaf-select-${leafOutpoint.vout}`

                return (
                  <div
                    key={`${leafOutpoint.txid}:${leafOutpoint.vout}`}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <div className="space-y-0.5">
                      <Label htmlFor={switchId} className="text-sm">
                        Select outpoint {leafOutpoint.vout} for exit
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {candidateRow != null
                          ? `${candidateRow.amountSats} sats`
                          : 'Exit-eligible VTXO'}
                      </p>
                    </div>
                    <Switch
                      id={switchId}
                      data-testid={`unilateral-exit-leaf-select-switch-${leafOutpoint.vout}`}
                      checked={isSelectedForExit}
                      onCheckedChange={() => onToggleLeaf(leafOutpoint)}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
