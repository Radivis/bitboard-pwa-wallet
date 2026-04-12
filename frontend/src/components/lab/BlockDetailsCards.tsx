import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Badge } from '@/components/ui/badge'
import { formatBTC, formatSats, truncateAddress } from '@/lib/bitcoin-utils'
import { LabOwnerDisplayWithAddressType } from '@/components/lab/LabOwnerDisplayWithAddressType'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import type { LabBlockDetails } from '@/workers/lab-api'
import {
  LabBlockHeaderInfomodeContent,
  LabBlockMerkleRootInfomodeContent,
} from '@/components/lab/LabBlockHeaderInfomodeContent'
import { CardPagination } from '@/components/CardPagination'
import { isCoinbase } from '@/lib/lab-operations'
import { netMovedSatsForBlock } from '@/lib/lab-tx-net-moved'
import { useLabBlockTransactionsPage } from '@/hooks/useLabPaginatedQueries'
import { LAB_CARD_PAGE_SIZE } from '@/lib/lab-paginated-queries'
import type { AddressType } from '@/lib/wallet-domain-types'
import { useWalletStore } from '@/stores/walletStore'

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
      infoComponent={LabBlockHeaderInfomodeContent}
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Block Header</CardTitle>
          <CardDescription>Core header fields for this block</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <InfomodeWrapper
            infoId="lab-block-field-version"
            infoTitle="Version"
            infoText="Block version number. Consensus upgrades sometimes coordinate using version bits; nodes interpret known versions under the current rules."
          >
            <HeaderField label="Version" value={String(block.header.version)} />
          </InfomodeWrapper>
          <InfomodeWrapper
            infoId="lab-block-field-prev-hash"
            infoTitle="Previous block hash"
            infoText="Hash of the previous block’s header. This links the block into the chain so every block confirms all history before it."
          >
            <HeaderField label="Previous block hash" value={block.header.previousBlockHash} />
          </InfomodeWrapper>
          <InfomodeWrapper
            infoId="lab-block-field-merkle-root"
            infoComponent={LabBlockMerkleRootInfomodeContent}
          >
            <HeaderField label="Merkle root" value={block.header.merkleRoot} />
          </InfomodeWrapper>
          <InfomodeWrapper
            infoId="lab-block-field-timestamp"
            infoTitle="Timestamp"
            infoText="Unix time (seconds) in the header. The network uses it for difficulty adjustment and as a loose ordering hint; it is not a perfect clock."
          >
            <HeaderField
              label="Timestamp"
              value={`${block.header.timestamp} (${new Date(block.header.timestamp * 1000).toLocaleString()})`}
            />
          </InfomodeWrapper>
          <InfomodeWrapper
            infoId="lab-block-field-target"
            infoTitle="Target"
            infoText="Mining difficulty: compact nBits and the expanded 256-bit target. A valid block hash must be numerically below this target (proof-of-work)."
          >
            <HeaderField
              label="Target"
              value={`bits=${block.header.targetBits} expanded=${block.header.targetExpanded}`}
            />
          </InfomodeWrapper>
          <InfomodeWrapper
            infoId="lab-block-field-nonce"
            infoTitle="Nonce"
            infoText="A 32-bit field miners change (along with extra nonce space in coinbase when needed) to search for a header hash below the target."
          >
            <HeaderField label="Nonce" value={String(block.header.nonce)} />
          </InfomodeWrapper>
          <InfomodeWrapper
            infoId="lab-block-field-header-hash"
            infoTitle="Block header hash"
            infoText="Double SHA-256 of the 80-byte header, usually shown reversed for display. This is the block identifier peers gossip and explorers show."
          >
            <HeaderField label="Block header hash" value={block.header.blockHeaderHash} />
          </InfomodeWrapper>
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
  const { data: labState } = useLabChainStateQuery()
  const entities = labState?.entities ?? []
  const txDetails = labState?.txDetails ?? []
  const netMovedSats = netMovedSatsForBlock(txDetails, block.metadata.height)
  const mineOp = labState?.mineOperations?.find((m) => m.height === block.metadata.height)
  const weightAtMiningRecorded =
    mineOp?.blockWeightLimitWu != null &&
    mineOp?.nonCoinbaseWeightUsedWu != null &&
    Number.isFinite(mineOp.blockWeightLimitWu) &&
    Number.isFinite(mineOp.nonCoinbaseWeightUsedWu)

  return (
    <InfomodeWrapper
      infoId="lab-block-detail-contextual-data-card"
      infoTitle="Contextual data"
      infoText="Where this block sits in the chain, when it was mined, who received the subsidy, how many transactions it contains, the fees from non-coinbase transactions, net moved BTC (sum of non-change outputs from non-coinbase transactions only; coinbase excluded), and (when recorded) the non-coinbase weight used versus the lab limit at mining time."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Contextual data</CardTitle>
          <CardDescription>Block summary and mining context</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p><span className="text-muted-foreground">Height:</span> {block.metadata.height}</p>
          <p>
            <span className="text-muted-foreground">Mined on:</span>{' '}
            {new Date(block.metadata.minedOn * 1000).toLocaleString()}
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Mined by:</span>
            {block.metadata.minedBy ? (
              <LabOwnerDisplayWithAddressType
                owner={block.metadata.minedBy}
                wallets={wallets}
                entities={entities}
              />
            ) : (
              'unknown'
            )}
          </p>
          <p>
            <span className="text-muted-foreground">Number of transactions:</span>{' '}
            {block.metadata.numberOfTransactions}
          </p>
          <p>
            <span className="text-muted-foreground">Total fees:</span>{' '}
            {formatSats(block.metadata.totalFeesSats)} sats
          </p>
          <p>
            <span className="text-muted-foreground">Net moved (BTC):</span>{' '}
            <span className="font-mono tabular-nums">{formatBTC(netMovedSats)}</span> BTC (
            {formatSats(netMovedSats)} sats)
          </p>
          {weightAtMiningRecorded && mineOp != null ? (
            <p>
              <span className="text-muted-foreground">Non-coinbase weight (at mining):</span>{' '}
              <span className="font-mono tabular-nums">
                {mineOp.nonCoinbaseWeightUsedWu} / {mineOp.blockWeightLimitWu} WU
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}

const labBlockTxRowLinkClassName =
  'flex flex-wrap items-center gap-2 rounded px-2 py-2 transition-colors hover:bg-muted/50'
const labBlockTxRowPlainClassName = 'flex flex-wrap items-center gap-2 rounded px-2 py-2'

function labBlockTxList(
  txs: LabBlockDetails['transactions'],
  wallets: Array<{ wallet_id: number; name: string }>,
  entities: readonly {
    labEntityId: number
    entityName: string | null
    addressType: AddressType
  }[],
  isTemplate: boolean,
) {
  return (
    <div className="space-y-2">
      {txs.map((tx) => {
        const coinbaseNoTxPageYet = isTemplate && isCoinbase(tx)
        const row = (
          <>
            {isCoinbase(tx) ? (
              <Badge variant="outline" className="shrink-0">
                Coinbase
              </Badge>
            ) : null}
            <span className="min-w-0 flex-1 font-mono text-sm" title={tx.txid}>
              {truncateAddress(tx.txid)}
            </span>
            <span className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-1">
              {isCoinbase(tx) ? (
                tx.receiver ? (
                  <LabOwnerDisplayWithAddressType
                    owner={tx.receiver}
                    wallets={wallets}
                    entities={entities}
                  />
                ) : (
                  'unknown reward'
                )
              ) : (
                <>
                  {tx.sender ? (
                    <LabOwnerDisplayWithAddressType
                      owner={tx.sender}
                      wallets={wallets}
                      entities={entities}
                    />
                  ) : (
                    'unknown'
                  )}
                  <span aria-hidden="true">→</span>
                  {tx.receiver ? (
                    <LabOwnerDisplayWithAddressType
                      owner={tx.receiver}
                      wallets={wallets}
                      entities={entities}
                    />
                  ) : (
                    'unknown'
                  )}
                </>
              )}
            </span>
            <span className="text-sm tabular-nums">{formatSats(tx.feeSats)} sats fee</span>
          </>
        )
        return coinbaseNoTxPageYet ? (
          <div key={tx.txid} className={labBlockTxRowPlainClassName}>
            {row}
          </div>
        ) : (
          <Link
            key={tx.txid}
            to="/lab/tx/$txid"
            params={{ txid: tx.txid }}
            className={labBlockTxRowLinkClassName}
          >
            {row}
          </Link>
        )
      })}
    </div>
  )
}

export function LabBlockTransactionsCard({
  block,
  wallets,
}: {
  block: LabBlockDetails
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const isTemplate = block.isTemplate
  const blockHeight = block.metadata.height
  const labNetworkEnabled = useWalletStore((s) => s.networkMode === 'lab')
  const { data: labState } = useLabChainStateQuery()
  const entities = labState?.entities ?? []

  const minedQuery = useLabBlockTransactionsPage(blockHeight, pageIndex, {
    enabled: !isTemplate && labNetworkEnabled,
  })

  useEffect(() => {
    setPageIndex(0)
  }, [isTemplate, blockHeight])

  const totalCount = isTemplate
    ? block.transactions.length
    : minedQuery.data?.totalCount ?? block.metadata.numberOfTransactions

  const txsForPage = isTemplate
    ? block.transactions.slice(
        pageIndex * LAB_CARD_PAGE_SIZE,
        (pageIndex + 1) * LAB_CARD_PAGE_SIZE,
      )
    : (minedQuery.data?.transactions ?? [])

  const showLoading = !isTemplate && minedQuery.isLoading && txsForPage.length === 0

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
          {totalCount === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions in this block.</p>
          ) : showLoading ? (
            <p className="text-sm text-muted-foreground">Loading transactions…</p>
          ) : minedQuery.isError && !isTemplate ? (
            <p className="text-sm text-destructive">Could not load transactions.</p>
          ) : (
            <CardPagination
              pageSize={LAB_CARD_PAGE_SIZE}
              totalCount={totalCount}
              pageIndex={pageIndex}
              onPageChange={setPageIndex}
              ariaLabel="Transactions page"
            >
              {labBlockTxList(txsForPage, wallets, entities, isTemplate)}
            </CardPagination>
          )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
