import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { formatSats, truncateAddress } from '@/lib/bitcoin-utils'
import { getOwnerDisplayName } from '@/lib/lab-utils'
import type { LabBlockDetails } from '@/workers/lab-api'

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-sm break-all">{value}</p>
    </div>
  )
}

export function LabBlockHeaderCard({ block }: { block: LabBlockDetails }) {
  return (
    <InfomodeWrapper
      infoId="lab-block-detail-header-card"
      infoTitle="Block header"
      infoText="The block header is the compact fingerprint of a block: version, link to previous block, merkle root, timestamp, target, nonce, and resulting header hash."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Block Header</CardTitle>
          <CardDescription>Core header fields for this block</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <HeaderField label="Version" value={String(block.header.version)} />
          <HeaderField label="Previous block hash" value={block.header.previousBlockHash} />
          <HeaderField label="Merkle root" value={block.header.merkleRoot} />
          <HeaderField
            label="Timestamp"
            value={`${block.header.timestamp} (${new Date(block.header.timestamp * 1000).toLocaleString()})`}
          />
          <HeaderField
            label="Target"
            value={`bits=${block.header.targetBits} expanded=${block.header.targetExpanded}`}
          />
          <HeaderField label="Nonce" value={String(block.header.nonce)} />
          <HeaderField label="Block header hash" value={block.header.blockHeaderHash} />
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}

export function LabBlockMetadataCard({
  block,
  wallets,
}: {
  block: LabBlockDetails
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  const minedBy = block.metadata.minedBy
    ? getOwnerDisplayName(block.metadata.minedBy, wallets)
    : 'unknown'

  return (
    <InfomodeWrapper
      infoId="lab-block-detail-metadata-card"
      infoTitle="Metadata"
      infoText="Context around this block: where it sits in chain order, who mined it, transaction count, and total fees."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
          <CardDescription>Block summary and mining context</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p><span className="text-muted-foreground">Height:</span> {block.metadata.height}</p>
          <p>
            <span className="text-muted-foreground">Mined on:</span>{' '}
            {new Date(block.metadata.minedOn * 1000).toLocaleString()}
          </p>
          <p><span className="text-muted-foreground">Mined by:</span> {minedBy}</p>
          <p>
            <span className="text-muted-foreground">Number of transactions:</span>{' '}
            {block.metadata.numberOfTransactions}
          </p>
          <p>
            <span className="text-muted-foreground">Total fees:</span>{' '}
            {formatSats(block.metadata.totalFeesSats)} sats
          </p>
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}

export function LabBlockTransactionsCard({
  block,
  wallets,
}: {
  block: LabBlockDetails
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  return (
    <InfomodeWrapper
      infoId="lab-block-detail-transactions-card"
      infoTitle="Transactions"
      infoText="All transactions included in this block. Open a transaction to inspect inputs and outputs in detail."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>Transactions included in this block</CardDescription>
        </CardHeader>
        <CardContent>
          {block.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions in this block.</p>
          ) : (
            <div className="space-y-2">
              {block.transactions.map((tx) => (
                <Link
                  key={tx.txid}
                  to="/lab/tx/$txid"
                  params={{ txid: tx.txid }}
                  className="flex items-center gap-3 rounded px-2 py-2 transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1 font-mono text-sm" title={tx.txid}>
                    {truncateAddress(tx.txid)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {tx.sender ? getOwnerDisplayName(tx.sender, wallets) : 'unknown'}
                    {' -> '}
                    {tx.receiver ? getOwnerDisplayName(tx.receiver, wallets) : 'unknown'}
                  </span>
                  <span className="text-sm tabular-nums">{formatSats(tx.feeSats)} sats fee</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
