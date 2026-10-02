import { useState } from 'react'
import { toast } from 'sonner'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatBarkVtxoExpiry, type BarkBitcoinNetwork } from '@/lib/bark/bark-vtxo-expiry'
import {
  formatBarkVtxoLockHolderLine,
  getBarkVtxoStateLabel,
} from '@/lib/bark/bark-vtxo-viewer-display'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'
import type { BarkVtxoRow } from '@/workers/bark-api'

interface BarkVtxoCardProps {
  row: BarkVtxoRow
  tipHeight: number | null
  networkMode: BarkBitcoinNetwork
  now?: Date
}

export function BarkVtxoCard({
  row,
  tipHeight,
  networkMode,
  now = new Date(),
}: BarkVtxoCardProps) {
  const [copied, setCopied] = useState(false)
  const lockHolderLine = formatBarkVtxoLockHolderLine(row)
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
    <Card data-testid={`bark-vtxo-card-${row.id}`}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className="font-mono text-left text-sm text-primary underline-offset-4 hover:underline"
            onClick={() => void handleCopyId()}
            aria-label={`Copy VTXO id ${row.id}`}
          >
            {copied ? 'Copied' : truncateAddress(row.id, 8, 8)}
          </button>
          <BitcoinAmountDisplay
            amountSats={row.amountSats}
            className="font-semibold"
            data-testid={`bark-vtxo-amount-${row.id}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{getBarkVtxoStateLabel(row.state)}</span>
          {row.registered ? (
            <Badge
              variant="outline"
              className="text-xs font-normal"
              data-testid={`bark-vtxo-registered-${row.id}`}
            >
              Registered
            </Badge>
          ) : null}
        </div>

        <div className="text-xs text-muted-foreground" data-testid={`bark-vtxo-expiry-${row.id}`}>
          <div>{expiry.blocksLabel}</div>
          {expiry.dateLabel != null ? <div>{expiry.dateLabel}</div> : null}
        </div>
        {lockHolderLine != null ? (
          <div
            className="text-xs text-muted-foreground"
            data-testid={`bark-vtxo-lock-holder-${row.id}`}
          >
            {lockHolderLine}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
