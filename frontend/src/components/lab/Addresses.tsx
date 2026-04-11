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
import {
  useLabAddressBalancesForAddresses,
  useLabAddressesForOwnerPage,
  useLabOwnerKeysPage,
} from '@/hooks/useLabPaginatedQueries'
import { LAB_CARD_PAGE_SIZE, LAB_ENTITY_INNER_PAGE_SIZE } from '@/lib/lab-paginated-queries'
import { useWalletStore } from '@/stores/walletStore'
import { Badge } from '@/components/ui/badge'
import { Wallet, FlaskConical, Copy, Skull } from 'lucide-react'

function LabOwnerAddressesInner({
  ownerKey,
  wallets,
  entities,
  onCopyAddress,
  addressPageIndex,
  onAddressPageChange,
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
  addressPageIndex: number
  onAddressPageChange: (pageIndex: number) => void
}) {
  const labNetworkEnabled = useWalletStore((s) => s.networkMode === 'lab')
  const { data } = useLabAddressesForOwnerPage(ownerKey, addressPageIndex, {
    enabled: labNetworkEnabled,
  })
  const addresses = data?.addresses ?? []
  const totalCount = data?.totalCount ?? 0
  const { data: balanceByAddress } = useLabAddressBalancesForAddresses(
    addresses.map((a) => a.address),
    { enabled: labNetworkEnabled && addresses.length > 0 },
  )

  return (
    <CardPagination
      pageSize={LAB_ENTITY_INNER_PAGE_SIZE}
      totalCount={totalCount}
      pageIndex={addressPageIndex}
      onPageChange={onAddressPageChange}
      ariaLabel={`Addresses page for ${getOwnerDisplayNameWithAddressTypeAria(ownerKey, wallets, entities)}`}
    >
      <div className="space-y-2">
        <div className="flex gap-4 text-sm font-medium text-muted-foreground">
          <span className="flex-1 min-w-0">Address</span>
          <span className="w-24 shrink-0 text-right">Balance</span>
          <span className="w-10 shrink-0" />
        </div>
        {addresses.map((a) => (
          <div
            key={a.address}
            className="flex gap-4 items-center py-2 border-b border-border last:border-0"
          >
            <span className="font-mono text-sm break-all flex-1 min-w-0">
              {truncateAddress(a.address)}
            </span>
            <span className="tabular-nums text-right w-24 shrink-0">
              {formatSats(balanceByAddress?.get(a.address) ?? 0)} sats
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => onCopyAddress(a.address)}
              aria-label={`Copy ${truncateAddress(a.address)}`}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </CardPagination>
  )
}

export function LabAddressesCard({
  onCopyAddress,
  wallets,
}: {
  onCopyAddress: (address: string) => void
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  const [ownerPageIndex, setOwnerPageIndex] = useState(0)
  const [innerAddressPageByOwner, setInnerAddressPageByOwner] = useState<Record<string, number>>({})

  const labNetworkEnabled = useWalletStore((s) => s.networkMode === 'lab')
  const { data: labState } = useLabChainStateQuery()
  const entities = labState?.entities ?? []
  const { data: ownerPage, isLoading, isError } = useLabOwnerKeysPage(ownerPageIndex, {
    enabled: labNetworkEnabled,
  })

  useEffect(() => {
    setInnerAddressPageByOwner({})
  }, [ownerPageIndex])

  const ownerKeys = ownerPage?.ownerKeys ?? []
  const totalOwnerCount = ownerPage?.totalCount ?? 0

  return (
    <InfomodeWrapper
      infoId="lab-addresses-card"
      infoTitle="Addresses (lab)"
      infoText="Every address that has appeared on the simulated chain—usually from mining rewards or transfers—with its current balance. Rows are grouped by owner (a named lab identity or your loaded wallet) so you can copy addresses into the transaction form or see who holds what.

When you send from an address, the wallet spends whole previous outputs (UTXOs) that funded that payment, so the address is fully drained for that spend. Leftover value is not left on the same address: it goes to change on a new address from your wallet. Fresh change addresses reduce address reuse and improve privacy, and they behave like real Bitcoin wallets here. That is why you will see many past addresses with 0 sats—they are no longer holding coins, but they stay listed so you can see where funds once appeared. Compare with the UTXOs card: this view is one total per address; UTXOs lists each spendable coin separately."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Addresses</CardTitle>
          <CardDescription>
            Total balance per address (one row per address). After sends, expect lots of 0 sats—spent addresses stay listed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && totalOwnerCount === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Loading addresses…</p>
          ) : isError ? (
            <p className="text-sm text-destructive py-4">Could not load addresses.</p>
          ) : totalOwnerCount === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No addresses yet. Mine blocks to create addresses.
            </p>
          ) : (
            <CardPagination
              pageSize={LAB_CARD_PAGE_SIZE}
              totalCount={totalOwnerCount}
              pageIndex={ownerPageIndex}
              onPageChange={setOwnerPageIndex}
              ariaLabel="Owner groups page"
            >
              <div className="space-y-5">
                {ownerKeys.map((owner) => (
                  <div
                    key={owner}
                    role="group"
                    aria-label={`${getOwnerDisplayNameWithAddressTypeAria(owner, wallets, entities)} — addresses in this group`}
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
                    <LabOwnerAddressesInner
                      ownerKey={owner}
                      wallets={wallets}
                      entities={entities}
                      onCopyAddress={onCopyAddress}
                      addressPageIndex={innerAddressPageByOwner[owner] ?? 0}
                      onAddressPageChange={(page) =>
                        setInnerAddressPageByOwner((prev) => ({ ...prev, [owner]: page }))
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
