import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import { useWallets } from '@/db'
import { useWalletStore } from '@/stores/walletStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/LoadingSpinner'

export const Route = createFileRoute('/wallets')({
  component: WalletsPage,
})

function WalletsPage() {
  const navigate = useNavigate()
  const { data: wallets, isLoading } = useWallets()
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet)

  const handleSelectWallet = (walletId: number) => {
    setActiveWallet(walletId)
    navigate({ to: '/' })
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
