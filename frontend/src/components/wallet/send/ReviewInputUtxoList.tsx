import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { DesignButton } from '@/components/design/DesignButton'
import { utxoOutpointKey } from '@/lib/wallet/manual-utxo-selection'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'
import type { ReviewInputUtxo } from '@/workers/crypto-api'
import { Minus, Plus } from 'lucide-react'

export function ReviewInputUtxoList({
  inputUtxos,
  action,
  onAction,
}: {
  inputUtxos: ReviewInputUtxo[]
  action?: 'add' | 'remove'
  onAction?: (utxo: ReviewInputUtxo) => void
}) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      {inputUtxos.map((utxo) => {
        const outpointKey = utxoOutpointKey(utxo)
        return (
        <div
          key={outpointKey}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {action != null && onAction != null ? (
              <DesignButton
                type="button"
                appearance="secondary"
                className="shrink-0"
                aria-label={
                  action === 'add'
                    ? `Add UTXO ${outpointKey} to selected inputs`
                    : `Remove UTXO ${outpointKey} from selected inputs`
                }
                onClick={() => onAction(utxo)}
                icon={action === 'add' ? <Plus /> : <Minus />}
              />
            ) : null}
            <span className="font-mono text-muted-foreground truncate">
              {truncateAddress(utxo.address)}
            </span>
          </div>
          <BitcoinAmountDisplay amountSats={utxo.amountSats} size="sm" />
        </div>
        )
      })}
    </div>
  )
}
