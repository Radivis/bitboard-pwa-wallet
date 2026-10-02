import { BarkExitTreeGraph } from '@/components/bark/BarkExitTreeGraph'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { barkEmergencyExitStateLabel } from '@/lib/bark/bark-emergency-exit'
import { formatSatPerVbTwoDecimals } from '@/lib/esplora/esplora-fee-estimates'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
import {
  barkEmergencyExitAmountLabel,
  BARK_EMERGENCY_EXIT_CLAIM_NOTE,
  type BarkEmergencyExitReview,
} from '@/hooks/useBarkEmergencyExitPage'
import type { BarkEmergencyExitRow, BarkExitGraphNode, BarkVtxoRow } from '@/workers/bark-api'

export function BarkEmergencyExitTreeCard({
  nodes,
  emptySelection,
  errorMessage,
  vtxoRows,
}: {
  nodes: BarkExitGraphNode[] | undefined
  emptySelection: boolean
  errorMessage: string | null
  vtxoRows: BarkVtxoRow[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Exit tree</CardTitle>
      </CardHeader>
      <CardContent>
        <BarkExitTreeGraph
          nodes={nodes}
          emptySelection={emptySelection}
          errorMessage={errorMessage}
          vtxoRows={vtxoRows}
        />
      </CardContent>
    </Card>
  )
}

export function BarkEmergencyExitStartCard({
  wholeWallet,
  spendableVtxos,
  selectedIds,
  review,
  busyAction,
  startBlocked,
  onWholeWalletChange,
  onToggleVtxo,
  onReview,
  onStart,
}: {
  wholeWallet: boolean
  spendableVtxos: BarkVtxoRow[]
  selectedIds: string[]
  review: BarkEmergencyExitReview | null
  busyAction: string | null
  startBlocked: boolean
  onWholeWalletChange: (checked: boolean) => void
  onToggleVtxo: (vtxoId: string) => void
  onReview: () => void
  onStart: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Start an exit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="bark-emergency-exit-whole-wallet"
            checked={wholeWallet}
            onChange={(event) => onWholeWalletChange(event.target.checked)}
          />
          Exit the whole wallet
        </label>
        <ul className="space-y-2">
          {spendableVtxos.map((row) => (
            <SpendableVtxoRow
              key={row.id}
              row={row}
              checked={!wholeWallet && selectedIds.includes(row.id)}
              disabled={wholeWallet}
              onToggle={() => onToggleVtxo(row.id)}
            />
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          data-testid="bark-emergency-exit-review"
          disabled={busyAction != null}
          onClick={onReview}
        >
          Review
        </Button>
        {review != null ? (
          <div className="space-y-1 text-sm" data-testid="bark-emergency-exit-fee-review">
            <p data-testid="bark-emergency-exit-fee-rate">
              Fee rate {formatSatPerVbTwoDecimals(review.estimate.feeRateSatPerVb)} sat/vB
            </p>
            <p data-testid="bark-emergency-exit-broadcast-fee">
              Broadcast fee {formatSats(review.estimate.exitBroadcastFeeSats)}
            </p>
            <p data-testid="bark-emergency-exit-claim-fee">
              Claim fee {formatSats(review.estimate.claimFeeSats)}
            </p>
            <p data-testid="bark-emergency-exit-tx-count">
              Transactions to broadcast {review.estimate.txsToBroadcast}
            </p>
            {startBlocked ? (
              <p data-testid="bark-emergency-exit-start-blocked">
                Confirmed on-chain balance is below the broadcast fee.
              </p>
            ) : null}
          </div>
        ) : null}
        <Button
          type="button"
          data-testid="bark-emergency-exit-start"
          disabled={review == null || startBlocked || busyAction != null}
          onClick={onStart}
        >
          Start emergency exit
        </Button>
      </CardContent>
    </Card>
  )
}

export function BarkEmergencyExitLiveCard({
  rows,
  vtxoRows,
  busyAction,
  onProgress,
  onCancel,
}: {
  rows: BarkEmergencyExitRow[]
  vtxoRows: BarkVtxoRow[]
  busyAction: string | null
  onProgress: () => void
  onCancel: (vtxoId: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live exits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          type="button"
          data-testid="bark-emergency-exit-progress"
          disabled={busyAction != null}
          onClick={onProgress}
        >
          Progress
        </Button>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.vtxoId}
              className="flex items-center justify-between gap-3 text-sm"
              data-testid={`bark-emergency-exit-row-${row.vtxoId}`}
            >
              <span>
                <span className="font-mono">{row.vtxoId}</span>
                {' · '}
                {barkEmergencyExitAmountLabel(vtxoRows, row.vtxoId)}
                {' · '}
                {barkEmergencyExitStateLabel(row.state)}
              </span>
              {row.cancelable ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid={`bark-emergency-exit-cancel-${row.vtxoId}`}
                  disabled={busyAction != null}
                  onClick={() => onCancel(row.vtxoId)}
                >
                  Cancel
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function BarkEmergencyExitClaimCard({
  destinationAddress,
  busyAction,
  onClaim,
}: {
  destinationAddress: string
  busyAction: string | null
  onClaim: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claim</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm" data-testid="bark-emergency-exit-destination">
          {destinationAddress || 'No receive address'}
        </p>
        <p className="text-sm text-muted-foreground">{BARK_EMERGENCY_EXIT_CLAIM_NOTE}</p>
        <Button
          type="button"
          data-testid="bark-emergency-exit-claim"
          disabled={destinationAddress.length === 0 || busyAction != null}
          onClick={onClaim}
        >
          Claim to this address
        </Button>
      </CardContent>
    </Card>
  )
}

function SpendableVtxoRow({
  row,
  checked,
  disabled,
  onToggle,
}: {
  row: BarkVtxoRow
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <li>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid={`bark-emergency-exit-vtxo-${row.id}`}
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
        />
        <span className="font-mono">{row.id}</span>
        <span>{formatSats(row.amountSats)}</span>
      </label>
    </li>
  )
}
