import { ArrowRight, Bitcoin, CakeSlice, Hash } from 'lucide-react'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { LabOwnerDisplayWithAddressType } from '@/components/lab/LabOwnerDisplayWithAddressType'
import { Badge } from '@/components/ui/badge'
import { truncateAddress } from '@/lib/bitcoin-utils'
import type { LabOwner } from '@/lib/lab-owner'
import type { AddressType } from '@/lib/wallet-domain-types'
import { cn } from '@/lib/utils'

type EntityForLabTxCard = {
  labEntityId: number
  entityName: string | null
  addressType: AddressType
}

export type LabTxCardProps = {
  txid: string
  sender: LabOwner | null
  receiver: LabOwner | null
  amountSats: number
  feeSats: number
  wallets: Array<{ wallet_id: number; name: string }>
  entities: readonly EntityForLabTxCard[]
  variant: 'transfer' | 'coinbase'
  className?: string
}

/**
 * Lab transaction: hash, from → to, and amounts in one wrapping flex row. Parents often place this in a grid of bordered cells (see Previous blocks card).
 */
export function LabTxCard({
  txid,
  sender,
  receiver,
  amountSats,
  feeSats,
  wallets,
  entities,
  variant,
  className,
}: LabTxCardProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 break-words text-sm',
        className,
      )}
    >
      {variant === 'coinbase' ? (
        <Badge variant="outline" className="shrink-0">
          Coinbase
        </Badge>
      ) : null}

      <span className="flex min-w-0 max-w-full items-center gap-1.5">
        <Hash className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">Transaction id</span>
        <span className="min-w-0 font-mono" title={txid}>
          {truncateAddress(txid)}
        </span>
      </span>

      {variant === 'transfer' ? (
        <span className="min-w-0 max-w-full">
          <span className="sr-only">From</span>
          {sender ? (
            <LabOwnerDisplayWithAddressType owner={sender} wallets={wallets} entities={entities} />
          ) : (
            'unknown'
          )}
        </span>
      ) : (
        <span className="sr-only">Source: coinbase subsidy</span>
      )}

      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-muted-foreground">
        <span className="sr-only">To</span>
        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 text-foreground">
          {variant === 'coinbase' && receiver == null
            ? 'unknown reward'
            : receiver ? (
              <LabOwnerDisplayWithAddressType
                owner={receiver}
                wallets={wallets}
                entities={entities}
              />
            ) : (
              'unknown'
            )}
        </span>
      </span>

      <span className="inline-flex min-w-0 items-center gap-1">
        <Bitcoin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">Amount</span>
        <BitcoinAmountDisplay amountSats={amountSats} size="sm" />
      </span>
      <span className="inline-flex min-w-0 items-center gap-1">
        <CakeSlice className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">Fee</span>
        <BitcoinAmountDisplay amountSats={feeSats} size="sm" />
      </span>
    </div>
  )
}
