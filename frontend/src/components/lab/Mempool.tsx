import { Link } from '@tanstack/react-router'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignLabTransactionCard } from '@/components/design/DesignLabTransactionCard'
import { netMovedSatsFromMempoolEntry } from '@/lib/lab/lab-tx-net-moved'
import { truncateAddress } from '@/lib/wallet/bitcoin-utils'
import type { MempoolEntry } from '@/workers/lab-api'
import type { WalletSummary } from '@/lib/wallet/wallet-domain-types'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'

export function LabMempoolCard({
  mempool,
  wallets,
}: {
  mempool: MempoolEntry[]
  wallets: WalletSummary[]
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
      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle>Mempool</DesignCardTitle>
          <DesignCardDescription>Unconfirmed transactions waiting for mining</DesignCardDescription>
        </DesignCardHeader>
        <DesignCardContent className="gap-3">
          {mempool.length === 0 ? (
            <p className="design-type-regular text-muted-foreground py-2">
              Mempool is empty. Create a transaction to see it here.
            </p>
          ) : (
            <div className="flex flex-wrap items-start gap-3">
              {mempool.map((tx) => {
                const amountSats = netMovedSatsFromMempoolEntry(tx)
                return (
                  <Link
                    key={tx.txid}
                    to="/lab/tx/$txid"
                    params={{ txid: tx.txid }}
                    className="block w-fit max-w-full rounded-[20px] outline-none"
                    aria-label={`Open transaction ${truncateAddress(tx.txid)}`}
                  >
                    <DesignLabTransactionCard
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
        </DesignCardContent>
      </DesignCard>
    </InfomodeWrapper>
  )
}
