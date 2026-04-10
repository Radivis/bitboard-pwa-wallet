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
import { getOwnerDisplayName, getOwnerIcon } from '@/lib/lab-utils'
import { CardPagination } from '@/components/CardPagination'
import {
  useLabAddressBalancesForAddresses,
  useLabAddressesForOwnerPage,
  useLabOwnerKeysPage,
} from '@/hooks/useLabPaginatedQueries'
import { LAB_CARD_PAGE_SIZE, LAB_ENTITY_INNER_PAGE_SIZE } from '@/lib/lab-paginated-queries'
import { useWalletStore } from '@/stores/walletStore'
import { Wallet, FlaskConical, Copy } from 'lucide-react'

function LabOwnerAddressesInner({
  ownerKey,
  wallets,
  onCopyAddress,
  addressPageIndex,
  onAddressPageChange,
}: {
  ownerKey: string
  wallets: Array<{ wallet_id: number; name: string }>
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
      ariaLabel={`Addresses page for ${getOwnerDisplayName(ownerKey, wallets)}`}
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
      infoText="Every address that has appeared on the simulated chain—usually from mining rewards or transfers—with its current balance. Rows are grouped by owner (a named lab identity or your loaded wallet) so you can copy addresses into the transaction form or see who holds what."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Addresses</CardTitle>
          <CardDescription>Addresses that have interacted with the network, grouped by owner</CardDescription>
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
                    aria-label={`${getOwnerDisplayName(owner, wallets)} — addresses in this group`}
                    className="rounded-lg border-[3px] border-border bg-muted/15 p-4 shadow-sm"
                  >
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-1">
                      {getOwnerIcon(owner) === 'wallet' ? (
                        <Wallet className="h-4 w-4" />
                      ) : (
                        <FlaskConical className="h-4 w-4" />
                      )}
                      {getOwnerDisplayName(owner, wallets)}
                    </h4>
                    <LabOwnerAddressesInner
                      ownerKey={owner}
                      wallets={wallets}
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
