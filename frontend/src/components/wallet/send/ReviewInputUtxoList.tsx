import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'
import type { ReviewInputUtxo } from '@/workers/crypto-api'

export function ReviewInputUtxoList({ inputUtxos }: { inputUtxos: ReviewInputUtxo[] }) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      {inputUtxos.map((utxo) => (
        <div
          key={`${utxo.txid}:${utxo.vout}`}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="font-mono text-muted-foreground">
            {truncateAddress(utxo.address)}
          </span>
          <BitcoinAmountDisplay amountSats={utxo.amountSats} size="sm" />
        </div>
      ))}
    </div>
  )
}
