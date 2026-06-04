import { Link } from '@tanstack/react-router'
import { Layers, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import {
  useArkadeBalanceQuery,
  useArkadeDelegateInfoQuery,
  useArkadeRenewMutation,
} from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { useWalletStore } from '@/stores/walletStore'
import { openArkadeSessionForWallet } from '@/lib/arkade/arkade-session-service'
import { useSessionStore } from '@/stores/sessionStore'
import { useQuery } from '@tanstack/react-query'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { ArkadeExitSection } from '@/components/wallet/ArkadeExitSection'

export function ArkadePanel() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const password = useSessionStore((s) => s.password)
  const show = isArkadeActiveForNetworkMode(networkMode)

  const balanceQuery = useArkadeBalanceQuery()
  const delegateQuery = useArkadeDelegateInfoQuery()
  const renewMutation = useArkadeRenewMutation()

  const addressQuery = useQuery({
    queryKey: ['arkade', 'address', activeWalletId, networkMode],
    enabled: show && activeWalletId != null && password != null,
    queryFn: async () => {
      if (activeWalletId == null || password == null) {
        throw new Error('Wallet locked')
      }
      await openArkadeSessionForWallet({ password, walletId: activeWalletId, networkMode })
      return getArkadeWorker().getAddress()
    },
  })

  if (!show) return null

  const balance = balanceQuery.data
  const delegateFee =
    delegateQuery.data?.fee != null ? Number(delegateQuery.data.fee) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" aria-hidden />
          Arkade (offchain layer)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Instant payments on Arkade use separate addresses from your on-chain{' '}
          <code className="text-xs">bc1</code> receive address. Renewal is handled by
          the Bitboard delegator while this app is closed.
        </p>

        {balanceQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading Arkade balance…
          </div>
        ) : balance ? (
          <div>
            <p className="text-xs text-muted-foreground">Balance</p>
            <BitcoinAmountDisplay amountSats={balance.confirmedSats} />
            {balance.totalSats !== balance.confirmedSats && (
              <p className="text-xs text-muted-foreground">
                Total (incl. pending):{' '}
                <BitcoinAmountDisplay amountSats={balance.totalSats} size="sm" />
              </p>
            )}
          </div>
        ) : null}

        {addressQuery.data && (
          <div className="break-all rounded-md border bg-muted/40 p-2 font-mono text-xs">
            {addressQuery.data}
          </div>
        )}

        {delegateFee != null && (
          <p className="text-xs text-muted-foreground">
            Delegator service fee: {delegateFee} sats per renewal (Bitboard Fulmine)
          </p>
        )}

        <ArkadeExitSection />

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/wallet/arkade/receive">Receive</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/wallet/arkade/send">Send</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/wallet/arkade/board">Board from on-chain</Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={renewMutation.isPending}
            onClick={() => renewMutation.mutate()}
          >
            Renew VTXOs now
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
