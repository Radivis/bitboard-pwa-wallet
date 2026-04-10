import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { truncateAddress } from '@/lib/bitcoin-utils'
import { getOwnerDisplayName } from '@/lib/lab-utils'

export function LabMempoolCard({
  mempool,
  wallets,
}: {
  mempool: Array<{ txid: string; sender: string | null; receiver: string | null }>
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  return (
    <InfomodeWrapper
      infoId="lab-mempool-card"
      infoTitle="Mempool (lab)"
      infoText="The mempool lists transactions that have been created in the lab but not yet included in a block. Once mined, they leave this list and appear under their block details page."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Mempool</CardTitle>
          <CardDescription>Unconfirmed transactions waiting for mining</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mempool.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Mempool is empty. Create a transaction to see it here.
            </p>
          ) : (
            <div className="space-y-2">
              {mempool.map((tx) => (
                <Link
                  key={tx.txid}
                  to="/lab/tx/$txid"
                  params={{ txid: tx.txid }}
                  className="flex gap-4 items-center py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded px-2 -mx-2 transition-colors"
                >
                  <span className="font-mono text-sm truncate flex-1 min-w-0" title={tx.txid}>
                    {truncateAddress(tx.txid)}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {tx.sender ? getOwnerDisplayName(tx.sender, wallets) : 'unknown'} →{' '}
                    {tx.receiver ? getOwnerDisplayName(tx.receiver, wallets) : 'unknown'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
