import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { truncateAddress, formatSats } from '@/lib/bitcoin-utils'
import { getOwnerDisplayName, getOwnerIcon } from '@/lib/lab-utils'
import { Wallet, FlaskConical, Copy } from 'lucide-react'

export function LabAddressesCard({
  addresses,
  addressToOwner,
  getBalanceForAddress,
  onCopyAddress,
  wallets,
}: {
  addresses: Array<{ address: string; wif?: string }>
  addressToOwner: Record<string, string> | null | undefined
  getBalanceForAddress: (address: string) => number
  onCopyAddress: (address: string) => void
  wallets: Array<{ wallet_id: number; name: string }>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Addresses</CardTitle>
        <CardDescription>Addresses that have interacted with the network</CardDescription>
      </CardHeader>
      <CardContent>
        {addresses.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No addresses yet. Mine blocks to create addresses.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-4 text-sm font-medium text-muted-foreground">
              <span className="flex-1 min-w-0">Address</span>
              <span className="w-24 shrink-0 text-right">Balance</span>
              <span className="w-24 shrink-0">Owner</span>
              <span className="w-10 shrink-0" />
            </div>
            {addresses.map((a) => {
              const owner = (addressToOwner ?? {})[a.address] ?? 'Unknown'
              return (
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
                  <span className="w-24 shrink-0 flex items-center gap-1">
                    {getOwnerIcon(owner) === 'wallet' ? (
                      <Wallet className="h-4 w-4" />
                    ) : (
                      <FlaskConical className="h-4 w-4" />
                    )}
                    {getOwnerDisplayName(owner, wallets)}
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
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
