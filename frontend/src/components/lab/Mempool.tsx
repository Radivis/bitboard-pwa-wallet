import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { LabTxCard } from '@/components/lab/LabTxCard'
import { netMovedSatsFromMempoolEntry } from '@/lib/lab-tx-net-moved'
import type { MempoolEntry } from '@/workers/lab-api'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'

export function LabMempoolCard({
  mempool,
  wallets,
}: {
  mempool: MempoolEntry[]
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  const { data: labState } = useLabChainStateQuery()
  const entities = labState?.entities ?? []
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
              {mempool.map((tx) => {
                const amountSats = netMovedSatsFromMempoolEntry(tx)
                return (
                  <Link
                    key={tx.txid}
                    to="/lab/tx/$txid"
                    params={{ txid: tx.txid }}
                    className="block min-w-0 rounded-lg border border-border p-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <LabTxCard
                      txid={tx.txid}
                      sender={tx.sender}
                      receiver={tx.receiver}
                      amountSats={amountSats}
                      feeSats={tx.feeSats}
                      wallets={wallets}
                      entities={entities}
                      variant="transfer"
                    />
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
