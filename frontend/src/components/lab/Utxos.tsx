import { useEffect, useState } from 'react'
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
import {
  getOwnerDisplayNameWithAddressTypeAria,
  getOwnerIcon,
} from '@/lib/lab-utils'
import { LabOwnerDisplayWithAddressType } from '@/components/lab/LabOwnerDisplayWithAddressType'
import { isLabEntityOwnerGroupDead } from '@/lib/lab-owner'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import { CardPagination } from '@/components/CardPagination'
import { useLabOwnerKeysPage, useLabUtxosForOwnerPage } from '@/hooks/useLabPaginatedQueries'
import { LAB_CARD_PAGE_SIZE, LAB_ENTITY_INNER_PAGE_SIZE } from '@/lib/lab-paginated-queries'
import { useWalletStore } from '@/stores/walletStore'
import { Badge } from '@/components/ui/badge'
import { Wallet, FlaskConical, Copy, Skull } from 'lucide-react'

function LabOwnerUtxosInner({
  ownerKey,
  wallets,
  entities,
  onCopyAddress,
  utxoPageIndex,
  onUtxoPageChange,
}: {
  ownerKey: string
  wallets: Array<{ wallet_id: number; name: string }>
  entities: readonly {
    labEntityId: number
    entityName: string | null
    isDead: boolean
    addressType: string
  }[]
  onCopyAddress: (address: string) => void
  utxoPageIndex: number
  onUtxoPageChange: (pageIndex: number) => void
}) {
  const labNetworkEnabled = useWalletStore((s) => s.networkMode === 'lab')
  const { data } = useLabUtxosForOwnerPage(ownerKey, utxoPageIndex, {
    enabled: labNetworkEnabled,
  })
  const utxos = data?.utxos ?? []
  const totalCount = data?.totalCount ?? 0

  return (
    <CardPagination
      pageSize={LAB_ENTITY_INNER_PAGE_SIZE}
      totalCount={totalCount}
      pageIndex={utxoPageIndex}
      onPageChange={onUtxoPageChange}
      ariaLabel={`UTXOs page for ${getOwnerDisplayNameWithAddressTypeAria(ownerKey, wallets, entities)}`}
    >
      <div className="space-y-2">
        <div className="flex gap-4 text-sm font-medium text-muted-foreground">
          <span className="flex-1 min-w-0">Address</span>
          <span className="w-24 shrink-0 text-right">Sats</span>
          <span className="w-10 shrink-0" />
        </div>
        {utxos.map((u) => (
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
    </CardPagination>
  )
}

export function LabUtxosCard({
  onCopyAddress,
  wallets,
}: {
  onCopyAddress: (address: string) => void
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  const [ownerPageIndex, setOwnerPageIndex] = useState(0)
  const [innerUtxoPageByOwner, setInnerUtxoPageByOwner] = useState<Record<string, number>>({})

  const labNetworkEnabled = useWalletStore((s) => s.networkMode === 'lab')
  const { data: labState } = useLabChainStateQuery()
  const entities = labState?.entities ?? []
  const { data: ownerPage, isLoading, isError } = useLabOwnerKeysPage(ownerPageIndex, {
    enabled: labNetworkEnabled,
  })

  useEffect(() => {
    setInnerUtxoPageByOwner({})
  }, [ownerPageIndex])

  const ownerKeys = ownerPage?.ownerKeys ?? []
  const totalOwnerCount = ownerPage?.totalCount ?? 0

  return (
    <InfomodeWrapper
      infoId="lab-utxos-card"
      infoTitle="UTXOs (lab)"
      infoText="UTXO stands for unspent transaction output—each row is a discrete chunk of coins sitting on an address until you spend it. Bitcoin wallets track these pieces rather than a single “account balance.” Here they are grouped by owner so you can see which lab identity or wallet holds spendable outputs before you build a transaction.

This is not the same as the Addresses card above: Addresses shows one combined balance per address. This card lists each unspent output on its own row, so one address can appear multiple times if several separate coins still sit there."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>UTXOs</CardTitle>
          <CardDescription>
            Each unspent coin (output) as its own row—not merged per address like the Addresses card above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && totalOwnerCount === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Loading UTXOs…</p>
          ) : isError ? (
            <p className="text-sm text-destructive py-4">Could not load UTXOs.</p>
          ) : totalOwnerCount === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No UTXOs yet. Mine blocks to create coinbase outputs.
            </p>
          ) : (
            <CardPagination
              pageSize={LAB_CARD_PAGE_SIZE}
              totalCount={totalOwnerCount}
              pageIndex={ownerPageIndex}
              onPageChange={setOwnerPageIndex}
              ariaLabel="UTXO owner groups page"
            >
              <div className="space-y-5">
                {ownerKeys.map((owner) => (
                  <div
                    key={owner}
                    role="group"
                    aria-label={`${getOwnerDisplayNameWithAddressTypeAria(owner, wallets, entities)} — UTXOs in this group`}
                    className="rounded-lg border-[3px] border-border bg-muted/15 p-4 shadow-sm"
                  >
                    <h4 className="text-sm font-medium mb-3 flex flex-wrap items-center gap-2">
                      {getOwnerIcon(owner) === 'wallet' ? (
                        <Wallet className="h-4 w-4" />
                      ) : (
                        <FlaskConical className="h-4 w-4" />
                      )}
                      <LabOwnerDisplayWithAddressType
                        owner={owner}
                        wallets={wallets}
                        entities={entities}
                      />
                      {isLabEntityOwnerGroupDead(owner, entities) ? (
                        <Badge variant="secondary" className="gap-1">
                          <Skull className="h-3 w-3" />
                          Dead
                        </Badge>
                      ) : null}
                    </h4>
                    <LabOwnerUtxosInner
                      ownerKey={owner}
                      wallets={wallets}
                      entities={entities}
                      onCopyAddress={onCopyAddress}
                      utxoPageIndex={innerUtxoPageByOwner[owner] ?? 0}
                      onUtxoPageChange={(page) =>
                        setInnerUtxoPageByOwner((prev) => ({ ...prev, [owner]: page }))
                      }
                    />
                  </div>
                ))}
              </div>
            </CardPagination>
          )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
