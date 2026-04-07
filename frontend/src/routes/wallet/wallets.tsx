import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Trash2, Wallet } from 'lucide-react'
import { useWallets } from '@/db'
import { useWalletStore } from '@/stores/walletStore'
import { removeLightningConnectionsHydrationQueries } from '@/lib/lightning-connections-hydration'
import { awaitInFlightWalletSecretsWrites } from '@/db/wallet-secrets-write-tracker'
import { useLightningStore } from '@/stores/lightningStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/wallet/wallets')({
  component: WalletsPage,
})

function WalletsPage() {
  const navigate = useNavigate()
  const { data: wallets, isLoading } = useWallets()
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet)
  const lockWallet = useWalletStore((s) => s.lockWallet)

  const handleSelectWallet = async (walletId: number) => {
    await awaitInFlightWalletSecretsWrites()
    useLightningStore.getState().purgeLightningConnectionsFromMemory()
    removeLightningConnectionsHydrationQueries()
    lockWallet()
    setActiveWallet(walletId)
    navigate({ to: '/wallet' })
  }

  /**
   * Delete requires this wallet to be active and (for the mainnet check) eventually unlocked.
   * Reuse the same lock/switch pattern as selecting a wallet, then open Management with
   * `openDelete` so the delete flow runs there.
   */
  const handleDeleteWalletIntent = async (event: React.MouseEvent, walletId: number) => {
    event.stopPropagation()
    await awaitInFlightWalletSecretsWrites()
    useLightningStore.getState().purgeLightningConnectionsFromMemory()
    removeLightningConnectionsHydrationQueries()
    lockWallet()
    setActiveWallet(walletId)
    navigate({ to: '/wallet/management', search: { openDelete: true } })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <LoadingSpinner text="Loading wallets..." />
      </div>
    )
  }

  if (!wallets || wallets.length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Select Wallet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a wallet to use
        </p>
      </div>

      <div className="space-y-3">
        {wallets.map((wallet) => (
          <Card
            key={wallet.wallet_id}
            className="cursor-pointer transition-colors hover:bg-muted/50"
            onClick={() => handleSelectWallet(wallet.wallet_id)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4" />
                {wallet.name}
              </CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Delete wallet ${wallet.name}`}
                onClick={(e) => void handleDeleteWalletIntent(e, wallet.wallet_id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Created {new Date(wallet.created_at).toLocaleDateString()}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
