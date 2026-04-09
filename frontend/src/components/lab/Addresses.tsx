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
import type { LabAddress } from '@/workers/lab-api'
import { Wallet, FlaskConical, Copy } from 'lucide-react'

export function LabAddressesCard({
  addressesByOwner,
  sortedAddressOwnerKeys,
  getBalanceForAddress,
  onCopyAddress,
  wallets,
}: {
  addressesByOwner: Map<string, LabAddress[]>
  sortedAddressOwnerKeys: string[]
  getBalanceForAddress: (address: string) => number
  onCopyAddress: (address: string) => void
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  const totalAddresses = [...addressesByOwner.values()].reduce((n, list) => n + list.length, 0)

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
        {totalAddresses === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No addresses yet. Mine blocks to create addresses.
          </p>
        ) : (
          <div className="space-y-4">
            {sortedAddressOwnerKeys.map((owner) => (
              <div key={owner}>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  {getOwnerIcon(owner) === 'wallet' ? (
                    <Wallet className="h-4 w-4" />
                  ) : (
                    <FlaskConical className="h-4 w-4" />
                  )}
                  {getOwnerDisplayName(owner, wallets)}
                </h4>
                <div className="space-y-2">
                  <div className="flex gap-4 text-sm font-medium text-muted-foreground">
                    <span className="flex-1 min-w-0">Address</span>
                    <span className="w-24 shrink-0 text-right">Balance</span>
                    <span className="w-10 shrink-0" />
                  </div>
                  {(addressesByOwner.get(owner) ?? []).map((a) => (
                    <div
                      key={a.address}
                      className="flex gap-4 items-center py-2 border-b border-border last:border-0"
                    >
                      <span className="font-mono text-sm break-all flex-1 min-w-0">
                        {truncateAddress(a.address)}
                      </span>
                      <span className="tabular-nums text-right w-24 shrink-0">
                        {formatSats(getBalanceForAddress(a.address))} sats
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </InfomodeWrapper>
  )
}
