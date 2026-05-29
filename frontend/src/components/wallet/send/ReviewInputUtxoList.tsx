import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { Button } from '@/components/ui/button'
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
      {inputUtxos.map((utxo) => (
        <div
          key={`${utxo.txid}:${utxo.vout}`}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {action != null && onAction != null ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={
                  action === 'add'
                    ? `Add UTXO ${utxo.txid}:${utxo.vout} to selected inputs`
                    : `Remove UTXO ${utxo.txid}:${utxo.vout} from selected inputs`
                }
                onClick={() => onAction(utxo)}
              >
                {action === 'add' ? (
                  <Plus className="h-4 w-4" />
                ) : (
                  <Minus className="h-4 w-4" />
                )}
              </Button>
            ) : null}
            <span className="font-mono text-muted-foreground truncate">
              {truncateAddress(utxo.address)}
            </span>
          </div>
          <BitcoinAmountDisplay amountSats={utxo.amountSats} size="sm" />
        </div>
      ))}
    </div>
  )
}
