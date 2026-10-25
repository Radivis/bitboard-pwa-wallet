import { useState } from 'react'
import { toast } from 'sonner'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { DesignCard, DesignCardContent } from '@/components/design/DesignCard'
import { DesignTag } from '@/components/design/DesignTag'
import { formatBarkVtxoExpiry, type BarkBitcoinNetwork } from '@/lib/bark/bark-vtxo-expiry'
import {
  formatBarkVtxoLockHolderLine,
  getBarkVtxoStateLabel,
} from '@/lib/bark/bark-vtxo-viewer-display'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'
import type { BarkMovementRow, BarkPendingAction, BarkVtxoRow } from '@/workers/bark-api'

interface BarkVtxoCardProps {
  row: BarkVtxoRow
  tipHeight: number | null
  networkMode: BarkBitcoinNetwork
  pendingActions?: readonly BarkPendingAction[]
  movements?: readonly BarkMovementRow[]
  emergencyExitPhaseLine?: string | null
  now?: Date
}

export function BarkVtxoCard({
  row,
  tipHeight,
  networkMode,
  pendingActions = [],
  movements = [],
  emergencyExitPhaseLine = null,
  now = new Date(),
}: BarkVtxoCardProps) {
  const [copied, setCopied] = useState(false)
  const lockHolderLine = formatBarkVtxoLockHolderLine(row, pendingActions, movements)
  const expiry = formatBarkVtxoExpiry({
    expiryHeight: row.expiryHeight,
    tipHeight,
    networkMode,
    now,
  })

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(row.id)
    setCopied(true)
    toast.success('VTXO id copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <DesignCard data-testid={`bark-vtxo-card-${row.id}`}>
      <DesignCardContent className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className="design-type-addresses text-left text-primary underline-offset-4 hover:underline"
            onClick={() => void handleCopyId()}
            aria-label={`Copy VTXO id ${row.id}`}
          >
            {copied ? 'Copied' : truncateAddress(row.id, 8, 8)}
          </button>
          <BitcoinAmountDisplay
            amountSats={row.amountSats}
            className="design-type-emphasis"
            data-testid={`bark-vtxo-amount-${row.id}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="design-type-emphasis">{getBarkVtxoStateLabel(row.state)}</span>
          {row.registered ? (
            <DesignTag data-testid={`bark-vtxo-registered-${row.id}`}>Registered</DesignTag>
          ) : null}
        </div>

        <div className="design-type-regular text-muted-foreground" data-testid={`bark-vtxo-expiry-${row.id}`}>
          <div>{expiry.blocksLabel}</div>
          {expiry.dateLabel != null ? <div>{expiry.dateLabel}</div> : null}
        </div>
        {lockHolderLine != null ? (
          <div
            className="design-type-regular text-muted-foreground"
            data-testid={`bark-vtxo-lock-holder-${row.id}`}
          >
            {lockHolderLine}
          </div>
        ) : null}
        {emergencyExitPhaseLine != null ? (
          <div
            className="design-type-regular text-muted-foreground"
            data-testid={`bark-vtxo-exit-phase-${row.id}`}
          >
            {emergencyExitPhaseLine}
          </div>
        ) : null}
      </DesignCardContent>
    </DesignCard>
  )
}
