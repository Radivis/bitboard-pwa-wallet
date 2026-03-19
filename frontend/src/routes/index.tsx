import { useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Wallet, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useWalletStore, NETWORK_LABELS } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WalletUnlock } from '@/components/WalletUnlock'
import { TransactionItem } from '@/components/TransactionItem'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { formatBTC, formatSats } from '@/lib/bitcoin-utils'
import { runIncrementalDashboardWalletSync } from '@/lib/wallet-utils'
import { labTransactionsForWallet, walletOwnerKey } from '@/lib/lab-utils'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function BalanceCard() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const balance = useWalletStore((s) => s.balance)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const { data: labState, isPending: labChainPending } = useLabChainStateQuery()
  const utxos = labState?.utxos ?? []
  const addressToOwner = labState?.addressToOwner ?? {}
  const labChainReady = networkMode === 'lab' && labState != null && !labChainPending

  const labBalanceSats =
    networkMode === 'lab' && activeWalletId != null && labChainReady
      ? utxos
          .filter((u) => addressToOwner[u.address] === walletOwnerKey(activeWalletId))
          .reduce((sum, u) => sum + u.amountSats, 0)
      : null

  const confirmedSats =
    networkMode === 'lab' && labBalanceSats !== null
      ? labBalanceSats
      : balance?.confirmed ?? 0
  const pendingSats =
    networkMode === 'lab' ? 0 : (balance?.trusted_pending ?? 0) + (balance?.untrusted_pending ?? 0)

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
        <p className="text-3xl font-semibold tabular-nums">
          {formatBTC(confirmedSats)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">BTC</p>
        <p className="mt-2 text-lg tabular-nums text-muted-foreground">
          {formatSats(confirmedSats)} sats
        </p>
        {pendingSats > 0 && (
          <p className="mt-1 text-sm text-yellow-600 dark:text-yellow-400">
            +{formatSats(pendingSats)} sats pending
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function SyncButton() {
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)
  const password = useSessionStore((s) => s.password)

  const isSyncing = walletStatus === 'syncing'

  const handleSync = useCallback(async () => {
    try {
      setWalletStatus('syncing')
      await runIncrementalDashboardWalletSync({
        networkMode,
        password,
        activeWalletId,
      })
      setWalletStatus('unlocked')
      toast.success('Wallet synced')
    } catch (err) {
      setWalletStatus('unlocked')
      toast.error(
        err instanceof Error ? err.message : 'Sync failed',
      )
    }
  }, [networkMode, activeWalletId, password, setWalletStatus])

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={isSyncing}
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
      {isSyncing ? 'Syncing...' : 'Sync'}
    </Button>
  )
}

function RecentTransactions() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const transactions = useWalletStore((s) => s.transactions)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const { data: labState, isPending: labChainPending } = useLabChainStateQuery()
  const labTransactions = labState?.transactions ?? []
  const labTxDetails = labState?.txDetails ?? []
  const labMempool = labState?.mempool ?? []
  const labChainReady = networkMode === 'lab' && labState != null && !labChainPending

  const labTransactionsForActiveWallet =
    networkMode === 'lab' && activeWalletId != null && labChainReady
      ? labTransactionsForWallet(
          { transactions: labTransactions, txDetails: labTxDetails, mempool: labMempool },
          activeWalletId,
        )
      : []

  const displayTransactions =
    networkMode === 'lab' ? labTransactionsForActiveWallet : transactions

  if (networkMode === 'lab' && !labChainReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4">
            Loading lab...
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Transactions</CardTitle>
          {networkMode !== 'lab' && <SyncButton />}
        </div>
      </CardHeader>
      <CardContent>
        {displayTransactions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="rounded-full bg-muted p-3">
              <Wallet className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {networkMode === 'lab'
                ? 'No transactions yet. Mine blocks or send to see activity.'
                : 'No transactions yet. Sync your wallet to see activity.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayTransactions.slice(0, 10).map((tx) => (
              <TransactionItem key={tx.txid} transaction={tx} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const lastSyncTime = useWalletStore((s) => s.lastSyncTime)

  if (!activeWalletId) {
    navigate({ to: '/setup' })
    return null
  }

  if (walletStatus !== 'unlocked' && walletStatus !== 'syncing') {
    return <WalletUnlock />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        {lastSyncTime && (
          <p className="text-xs text-muted-foreground">
            Last synced: {lastSyncTime.toLocaleTimeString()}
          </p>
        )}
      </div>

      {walletStatus === 'syncing' && (
        <LoadingSpinner text="Syncing wallet..." />
      )}

      <BalanceCard />
      <RecentTransactions />
    </div>
  )
}
