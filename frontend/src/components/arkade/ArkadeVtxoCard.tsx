import { useState } from 'react'
import { DoorOpen } from 'lucide-react'
import { DesignCard, DesignCardContent } from '@/components/design/DesignCard'
import { DesignTag } from '@/components/design/DesignTag'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { ArkadeVtxoClassificationIcon } from '@/components/arkade/ArkadeVtxoClassificationIcon'
import {
  formatArkadeVtxoDateTime,
  formatArkadeVtxoUnilateralExitPhaseLine,
  getArkadeVtxoClassificationLabel,
  getArkadeVtxoFlagChipLabel,
  getArkadeVtxoFlagChips,
  type ArkadeVtxoFlagChip,
} from '@/lib/arkade/arkade-vtxo-viewer-display'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'
import type { ArkadeVtxoExitPhase, ArkadeVtxoRowBase } from '@/workers/arkade-api'
import { toast } from 'sonner'

interface ArkadeVtxoCardProps {
  row: ArkadeVtxoRowBase
  unilateralExitPhase?: ArkadeVtxoExitPhase
}

function ArkadeVtxoFlagChipBadge({ chip }: { chip: ArkadeVtxoFlagChip }) {
  const label = getArkadeVtxoFlagChipLabel(chip)
  if (chip === 'unilateralExitPrepared') {
    return <DesignTag icon={<DoorOpen aria-hidden />}>{label}</DesignTag>
  }
  return <DesignTag>{label}</DesignTag>
}

export function ArkadeVtxoCard({ row, unilateralExitPhase }: ArkadeVtxoCardProps) {
  const [copied, setCopied] = useState(false)
  const flagChips = getArkadeVtxoFlagChips(row)
  const unilateralExitPhaseLine = formatArkadeVtxoUnilateralExitPhaseLine(unilateralExitPhase)

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(row.id)
    setCopied(true)
    toast.success('VTXO id copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <DesignCard data-testid={`arkade-vtxo-card-${row.id}`}>
      <DesignCardContent className="space-y-2">
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
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <ArkadeVtxoClassificationIcon
              classification={row.classification}
              className="h-4 w-4"
            />
            {getArkadeVtxoClassificationLabel(row.classification)}
          </span>
          {flagChips.map((chip) => (
            <ArkadeVtxoFlagChipBadge key={chip} chip={chip} />
          ))}
        </div>

        <div className="text-xs text-muted-foreground">
          <span>Created: {formatArkadeVtxoDateTime(row.createdAt)}</span>
          <span className="mx-2">·</span>
          <span>Expires: {formatArkadeVtxoDateTime(row.expiresAt)}</span>
        </div>
        {unilateralExitPhaseLine != null ? (
          <div
            className="text-xs text-muted-foreground"
            data-testid={`arkade-vtxo-unilateral-exit-phase-${row.id}`}
          >
            {unilateralExitPhaseLine}
          </div>
        ) : null}
      </DesignCardContent>
    </DesignCard>
  )
}
