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

const MAX_DISPLAYED_LAB_TRANSACTIONS = 10

export function LabTransactionsCard({
  mempool,
  sortedTransactions,
  txDetailsByTxid,
  blockCount,
  wallets,
}: {
  mempool: Array<{ txid: string; sender: string | null; receiver: string | null }>
  sortedTransactions: Array<{ txid: string; sender: string | null; receiver: string | null }>
  txDetailsByTxid: Map<string, { blockHeight: number; outputs: Array<{ amountSats: number }> }>
  blockCount: number
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  return (
    <InfomodeWrapper
      infoId="lab-transactions-card"
      infoTitle="Transactions (lab)"
      infoText="The mempool lists transactions that have been created in the lab but not yet included in a block. After you mine blocks, those txs move into “Confirmed” with a confirmation count (how many blocks have been mined on top). Tap any row to inspect inputs, outputs, and amounts in detail—mirroring how explorers present real chain history."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>Mempool and confirmed transactions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
        {mempool.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Mempool</h4>
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
          </div>
        )}
        <div>
          <h4 className="text-sm font-medium mb-2">Confirmed</h4>
          {sortedTransactions.length === 0 && mempool.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No transactions yet. Create a transaction to see it here.
            </p>
          ) : sortedTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No confirmed transactions yet. Mine blocks to confirm mempool transactions.
            </p>
          ) : (
            <div className="space-y-2">
              {sortedTransactions.slice(0, MAX_DISPLAYED_LAB_TRANSACTIONS).map((tx) => {
                const details = txDetailsByTxid.get(tx.txid)
                const confirmations = details
                  ? blockCount - details.blockHeight
                  : 0
                return (
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
                      {' '}
                      ({confirmations} confirmations)
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </InfomodeWrapper>
  )
}
