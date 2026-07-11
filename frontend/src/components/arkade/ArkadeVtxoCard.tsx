import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import {
  formatArkadeVtxoDateTime,
  getArkadeVtxoClassificationLabel,
  getArkadeVtxoFlagChips,
} from '@/lib/arkade/arkade-vtxo-viewer-display'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'
import type { ArkadeVtxoRowBase } from '@/workers/arkade-api'
import { toast } from 'sonner'

interface ArkadeVtxoCardProps {
  row: ArkadeVtxoRowBase
}

export function ArkadeVtxoCard({ row }: ArkadeVtxoCardProps) {
  const [copied, setCopied] = useState(false)
  const flagChips = getArkadeVtxoFlagChips(row)

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(row.id)
    setCopied(true)
    toast.success('VTXO id copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card data-testid={`arkade-vtxo-card-${row.id}`}>
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
            data-testid={`arkade-vtxo-amount-${row.id}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">
            {getArkadeVtxoClassificationLabel(row.classification)}
          </span>
          {flagChips.map((chip) => (
            <Badge key={chip} variant="outline" className="text-xs font-normal">
              {chip}
            </Badge>
          ))}
        </div>

        <div className="text-xs text-muted-foreground">
          <span>Created: {formatArkadeVtxoDateTime(row.createdAt)}</span>
          <span className="mx-2">·</span>
          <span>Expires: {formatArkadeVtxoDateTime(row.expiresAt)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
