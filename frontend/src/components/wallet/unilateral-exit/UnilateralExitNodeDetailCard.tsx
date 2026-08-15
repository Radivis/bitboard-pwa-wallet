import { Check, Loader2 } from 'lucide-react'
import { ArkadeSharedLeafUnilateralExitInfomodeContent } from '@/components/arkade/infomode/ArkadeSharedLeafUnilateralExitInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import {
  formatUnilateralExitTxTypeLabel,
  resolveUnilateralExitNodeIconKind,
  unilateralExitNodeIconComponent,
} from '@/lib/arkade/unilateral-exit-node-icons'
import {
  hostOutpointsForTxid,
  leafOutpointsForTxid,
  parseUnilateralExitNodeId,
  shortTxid,
} from '@/lib/arkade/unilateral-exit-topology'
import { cn } from '@/lib/shared/utils'
import type {
  ArkadeUnilateralExitNodeStatus,
  ArkadeUnilateralExitTopology,
  ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import { includesArkadeVtxoOutpoint } from '@/workers/arkade-api'

interface UnilateralExitNodeDetailCardProps {
  topology: ArkadeUnilateralExitTopology
  focusedNodeId: string
  nodeStatuses: ArkadeUnilateralExitNodeStatus[]
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  onToggleLeafTxGroup: (outpoints: ArkadeVtxoOutpoint[]) => void
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
  selectedLeafOutpoints,
  onToggleLeafTxGroup,
}: UnilateralExitNodeDetailCardProps) {
  const { txid } = parseUnilateralExitNodeId(focusedNodeId)
  const topologyNode = topology.nodes.find((node) => node.txid === txid)
  const exitStartLeafOutpoints = leafOutpointsForTxid(topology, txid)
  const hostOutpointsForTx = hostOutpointsForTxid(topology, txid)
  const isExitStartLeaf = exitStartLeafOutpoints.length > 0
  const vtxoRows =
    hostOutpointsForTx.length > 0
      ? hostOutpointsForTx.map((hostOutpoint) => ({
          key: `${hostOutpoint.txid}:${hostOutpoint.vout}`,
          vout: hostOutpoint.vout,
          amountLabel: `${hostOutpoint.amountSats} sats`,
        }))
      : exitStartLeafOutpoints.map((leafOutpoint) => ({
          key: `${leafOutpoint.txid}:${leafOutpoint.vout}`,
          vout: leafOutpoint.vout,
          amountLabel: null as string | null,
        }))
  const txType = topologyNode?.txType ?? 'unknown'
  const status = resolveNodeStatus(txid, nodeStatuses)
  const iconKind = resolveUnilateralExitNodeIconKind({ txType, isLeaf: isExitStartLeaf })
  const Icon = unilateralExitNodeIconComponent(iconKind)
  const allLeafOutpointsSelected =
    exitStartLeafOutpoints.length > 0 &&
    exitStartLeafOutpoints.every((outpoint) =>
      includesArkadeVtxoOutpoint(selectedLeafOutpoints, outpoint),
    )

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
              {formatUnilateralExitTxTypeLabel(txType, isExitStartLeaf)}
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
          {vtxoRows.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  VTXO outpoints on this {isExitStartLeaf ? 'leaf' : 'node'}
                </p>
                <ul className="space-y-1">
                  {vtxoRows.map((vtxoRow) => (
                      <li
                        key={vtxoRow.key}
                        className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs"
                      >
                        <span>Outpoint {vtxoRow.vout}</span>
                        {vtxoRow.amountLabel != null ? (
                          <span className="text-muted-foreground">{vtxoRow.amountLabel}</span>
                        ) : null}
                      </li>
                    ))}
                </ul>
              </div>
              {isExitStartLeaf && (
                <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <InfomodeWrapper
                    infoId={ARKADE_INFOMODE_IDS.sharedLeafUnilateralExit}
                    infoComponent={ArkadeSharedLeafUnilateralExitInfomodeContent}
                    as="span"
                  >
                    <Label htmlFor="unilateral-exit-leaf-select" className="text-sm">
                      Select this leaf for exit
                    </Label>
                  </InfomodeWrapper>
                  <Switch
                    id="unilateral-exit-leaf-select"
                    data-testid="unilateral-exit-leaf-select-switch"
                    checked={allLeafOutpointsSelected}
                    onCheckedChange={() => onToggleLeafTxGroup(exitStartLeafOutpoints)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
