import { useEffect, useMemo, useState } from 'react'
import type { LabBlock, LabMineOperationRecord, LabTxDetails } from '@/workers/lab-api'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { CardPagination } from '@/components/CardPagination'
import { LAB_CARD_PAGE_SIZE } from '@/lib/lab-paginated-queries'
import { feeSatsFromTxDetails } from '@/lib/lab-tx-fee'
import { netMovedSatsForBlock } from '@/lib/lab-tx-net-moved'
import { LabBlockSquare } from '@/components/lab/LabBlockSquare'
import type { LabOwner } from '@/lib/lab-owner'

function totalFeesForBlockHeight(txDetails: readonly LabTxDetails[], blockHeight: number): number {
  return txDetails
    .filter((tx) => tx.blockHeight === blockHeight)
    .reduce((sum, tx) => sum + feeSatsFromTxDetails(tx), 0)
}

export function LabPreviousBlocksCard({
  blocks,
  mineOperations,
  txDetails,
  entities,
  wallets,
}: {
  blocks: LabBlock[]
  mineOperations: readonly LabMineOperationRecord[]
  txDetails: readonly LabTxDetails[]
  entities: readonly {
    labEntityId: number
    entityName: string | null
    addressType: string
  }[]
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  const byHeightDesc = useMemo(() => [...blocks].sort((a, b) => b.height - a.height), [blocks])

  const rows = useMemo(() => {
    return byHeightDesc.map((block) => {
      const txsAtHeight = txDetails.filter((t) => t.blockHeight === block.height)
      const mineOp = mineOperations.find((m) => m.height === block.height)
      const minedBy: LabOwner | null = mineOp?.minedBy ?? null
      const firstTime = txsAtHeight[0]?.blockTime ?? 0
      return {
        block,
        txCount: txsAtHeight.length,
        totalFeesSats: totalFeesForBlockHeight(txDetails, block.height),
        netMovedSats: netMovedSatsForBlock(txDetails, block.height),
        minedOnUnix: firstTime,
        minedBy,
        blockWeightLimitWu: mineOp?.blockWeightLimitWu ?? null,
        nonCoinbaseWeightUsedWu: mineOp?.nonCoinbaseWeightUsedWu ?? null,
      }
    })
  }, [byHeightDesc, mineOperations, txDetails])

  const totalCount = rows.length
  const [pageIndex, setPageIndex] = useState(0)

  const maxPage = Math.max(0, Math.ceil(totalCount / LAB_CARD_PAGE_SIZE) - 1)
  useEffect(() => {
    if (pageIndex > maxPage) setPageIndex(maxPage)
  }, [maxPage, pageIndex])

  const pageRows = useMemo(() => {
    const start = pageIndex * LAB_CARD_PAGE_SIZE
    return rows.slice(start, start + LAB_CARD_PAGE_SIZE)
  }, [rows, pageIndex])

  return (
    <InfomodeWrapper
      infoId="lab-previous-blocks-card"
      infoTitle="Previous blocks (lab)"
      infoText="Mined blocks as compact square cards: icons show height, transaction count, miner, fees, net moved BTC (sum of non-change outputs from non-coinbase transactions only; coinbase is excluded), mined date and time, and non-coinbase weight versus the limit recorded when the block was mined (shown only as background fill). Paginate when there are many blocks."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Previous blocks</CardTitle>
          <CardDescription>Open a block for full details</CardDescription>
        </CardHeader>
        <CardContent>
          {totalCount === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No blocks mined yet.</p>
          ) : (
            <CardPagination
              pageSize={LAB_CARD_PAGE_SIZE}
              totalCount={totalCount}
              pageIndex={pageIndex}
              onPageChange={setPageIndex}
              ariaLabel="Previous blocks page"
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
                {pageRows.map((row) => (
                  <LabBlockSquare
                    key={row.block.blockHash}
                    height={row.block.height}
                    txCount={row.txCount}
                    totalFeesSats={row.totalFeesSats}
                    netMovedSats={row.netMovedSats}
                    minedOnUnix={row.minedOnUnix}
                    minedBy={row.minedBy}
                    blockWeightLimitWu={row.blockWeightLimitWu}
                    nonCoinbaseWeightUsedWu={row.nonCoinbaseWeightUsedWu}
                    wallets={wallets}
                    entities={entities}
                  />
                ))}
              </div>
            </CardPagination>
          )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
