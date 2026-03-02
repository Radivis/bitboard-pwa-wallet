import { createFileRoute } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import { useWalletStore, NETWORK_LABELS } from '@/stores/walletStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function BalanceCard() {
  const networkMode = useWalletStore((state) => state.networkMode)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Balance
          </CardTitle>
          <Badge variant="outline">{NETWORK_LABELS[networkMode]}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">0.00000000</p>
        <p className="mt-1 text-sm text-muted-foreground">BTC</p>
        <p className="mt-2 text-lg tabular-nums text-muted-foreground">0 sats</p>
      </CardContent>
    </Card>
  )
}

function RecentTransactions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="rounded-full bg-muted p-3">
            <Wallet className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No transactions yet. Once you set up a wallet, your transactions will appear here.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function DashboardPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
      <BalanceCard />
      <RecentTransactions />
    </div>
  )
}
