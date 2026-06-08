import { Link } from '@tanstack/react-router'
import { Layers, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { useArkadeBalanceQuery } from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { useWalletStore } from '@/stores/walletStore'

export function ArkadeDashboardBalance() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const show = isArkadeActiveForNetworkMode(networkMode)
  const balanceQuery = useArkadeBalanceQuery()

  if (!show) return null

  return (
    <Card data-testid="dashboard-arkade-balance-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4" aria-hidden />
          Arkade balance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {balanceQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </div>
        ) : balanceQuery.data ? (
          <div>
            <BitcoinAmountDisplay
              amountSats={balanceQuery.data.confirmedSats}
              data-testid="dashboard-arkade-balance-amount"
            />
            {balanceQuery.data.totalSats !== balanceQuery.data.confirmedSats && (
              <p className="text-xs text-muted-foreground">
                Total (incl. recoverable):{' '}
                <BitcoinAmountDisplay amountSats={balanceQuery.data.totalSats} size="sm" />
              </p>
            )}
          </div>
        ) : (
          <p
            className="text-sm text-muted-foreground"
            data-testid="dashboard-arkade-session-empty"
          >
            No Arkade session yet
          </p>
        )}
        <Link
          to="/wallet/management"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Arkade in Management
        </Link>
      </CardContent>
    </Card>
  )
}
