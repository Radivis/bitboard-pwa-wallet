import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { truncateAddress, formatSats } from '@/lib/bitcoin-utils'
import { getOwnerDisplayName, getOwnerIcon } from '@/lib/lab-utils'
import { Wallet, FlaskConical, Copy } from 'lucide-react'

export function LabUtxosCard({
  utxos,
  utxosByOwner,
  sortedOwnerKeys,
  onCopyAddress,
  wallets,
}: {
  utxos: Array<{ txid: string; vout: number; address: string; amountSats: number }>
  utxosByOwner: Map<string, Array<{ txid: string; vout: number; address: string; amountSats: number }>>
  sortedOwnerKeys: string[]
  onCopyAddress: (address: string) => void
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  return (
    <InfomodeWrapper
      infoId="lab-utxos-card"
      infoTitle="UTXOs (lab)"
      infoText="UTXO stands for unspent transaction output—each row is a discrete chunk of coins sitting on an address until you spend it. Bitcoin wallets track these pieces rather than a single “account balance.” Here they are grouped by owner so you can see which lab identity or wallet holds spendable outputs before you build a transaction."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>UTXOs</CardTitle>
          <CardDescription>Unspent transaction outputs, grouped by owner</CardDescription>
        </CardHeader>
        <CardContent>
        {utxos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No UTXOs yet. Mine blocks to create coinbase outputs.
          </p>
        ) : (
          <div className="space-y-4">
            {sortedOwnerKeys.map((owner) => (
              <div key={owner}>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  {getOwnerIcon(owner) === 'wallet' ? (
                    <Wallet className="h-4 w-4" />
                  ) : (
                    <FlaskConical className="h-4 w-4" />
                  )}
                  {getOwnerDisplayName(owner, wallets)}
                </h4>
                <div className="space-y-2">
                  <div className="flex gap-4 text-sm font-medium text-muted-foreground">
                    <span className="flex-1 min-w-0">Address</span>
                    <span className="w-24 shrink-0 text-right">Sats</span>
                    <span className="w-10 shrink-0" />
                  </div>
                  {(utxosByOwner.get(owner) ?? []).map((u) => (
                    <div
                      key={`${u.txid}:${u.vout}`}
                      className="flex gap-4 items-center py-2 border-b border-border last:border-0"
                    >
                      <span className="font-mono text-sm break-all flex-1 min-w-0">
                        {truncateAddress(u.address)}
                      </span>
                      <span className="tabular-nums text-right w-24 shrink-0">
                        {formatSats(u.amountSats)} sats
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => onCopyAddress(u.address)}
                        aria-label={`Copy ${truncateAddress(u.address)}`}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </InfomodeWrapper>
  )
}
