import { useCallback, useMemo } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Wallet, RefreshCw, Home, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWalletStore, NETWORK_LABELS } from '@/stores/walletStore'
import {
  hasNetworkConnectedWallet,
  useLightningStore,
} from '@/stores/lightningStore'
import { useSessionStore } from '@/stores/sessionStore'
import { PageHeader } from '@/components/PageHeader'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WalletUnlock } from '@/components/WalletUnlock'
import { TransactionItem } from '@/components/TransactionItem'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { formatBTC, formatSats } from '@/lib/bitcoin-utils'
import { balanceInfoToOnChainDisplay } from '@/lib/onchain-balance-display'
import { runIncrementalDashboardWalletSync } from '@/lib/wallet-utils'
import { labTransactionsForWallet, walletOwnerKey } from '@/lib/lab-utils'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import {
  useLightningBalancesForDashboardQuery,
  useLightningHistoryQuery,
} from '@/hooks/useLightningMutations'
import { useFeatureStore } from '@/stores/featureStore'
import { isLightningSupported } from '@/lib/lightning-utils'
import { mergeAndSortDashboardActivity } from '@/lib/lightning-dashboard-sync'
import { LightningPaymentItem } from '@/components/LightningPaymentItem'

export const Route = createFileRoute('/wallet/')({
  component: DashboardPage,
})

function BalanceCard() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const balance = useWalletStore((s) => s.balance)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const lightningEnabled = useFeatureStore((s) => s.lightningEnabled)
  const connectedLightningWallets = useLightningStore((s) => s.connectedWallets)
  const lnBalancesQuery = useLightningBalancesForDashboardQuery()
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

  const onChainDisplay =
    networkMode === 'lab' && labBalanceSats !== null
      ? {
          showBreakdown: false,
          totalSats: labBalanceSats,
          confirmedSats: labBalanceSats,
          trustedPendingSats: 0,
          untrustedPendingSats: 0,
          immatureSats: 0,
        }
      : balanceInfoToOnChainDisplay(balance)

  const primarySats = onChainDisplay.totalSats

  const hasMatchingLightningConnection = useMemo(
    () =>
      lightningEnabled &&
      networkMode !== 'lab' &&
      hasNetworkConnectedWallet(
        connectedLightningWallets,
        activeWalletId,
        networkMode,
      ),
    [
      lightningEnabled,
      networkMode,
      activeWalletId,
      connectedLightningWallets,
    ],
  )

  const showLightningBalances = hasMatchingLightningConnection

  const lnTotalSats = lnBalancesQuery.data?.totalSats ?? 0
  const lnPerWallet = lnBalancesQuery.data?.perWallet ?? []

  return (
    <InfomodeWrapper
      infoId="dashboard-balance-card"
      infoTitle="Balance"
      infoText="This is your on-chain Bitcoin on the network shown in the badge. The headline is your total balance (everything the wallet counts toward that total). When something is still unconfirmed, you may see a breakdown: spendable (settled in a block), pending change (value returning from a send you made), and pending incoming (someone else’s payment to you not yet confirmed). Immature appears rarely (e.g. mining rewards before they mature). On Lab mode, the total comes from the simulator’s coins tied to your wallet instead of the live Esplora-backed ledger."
      className="rounded-xl"
    >
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
        <CardContent className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              On-chain
            </p>
            <p className="text-3xl font-semibold tabular-nums">
              {formatBTC(primarySats)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">BTC</p>
            <p className="mt-2 text-lg tabular-nums text-muted-foreground">
              {formatSats(primarySats)} sats
            </p>
            {onChainDisplay.showBreakdown && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {onChainDisplay.confirmedSats > 0 && (
                  <li className="flex justify-between gap-2 tabular-nums text-muted-foreground">
                    <span>Spendable (settled)</span>
                    <span>{formatSats(onChainDisplay.confirmedSats)} sats</span>
                  </li>
                )}
                {onChainDisplay.trustedPendingSats > 0 && (
                  <li className="flex justify-between gap-2 tabular-nums text-yellow-600 dark:text-yellow-400">
                    <span>Pending change</span>
                    <span>{formatSats(onChainDisplay.trustedPendingSats)} sats</span>
                  </li>
                )}
                {onChainDisplay.untrustedPendingSats > 0 && (
                  <li className="flex justify-between gap-2 tabular-nums text-yellow-600 dark:text-yellow-400">
                    <span>Pending incoming</span>
                    <span>
                      {formatSats(onChainDisplay.untrustedPendingSats)} sats
                    </span>
                  </li>
                )}
                {onChainDisplay.immatureSats > 0 && (
                  <li className="flex justify-between gap-2 tabular-nums text-muted-foreground">
                    <span>Immature</span>
                    <span>{formatSats(onChainDisplay.immatureSats)} sats</span>
                  </li>
                )}
              </ul>
            )}
          </div>

          {showLightningBalances && lnBalancesQuery.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Lightning balances…
            </div>
          )}

          {showLightningBalances &&
            lnBalancesQuery.isSuccess &&
            lnPerWallet.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Lightning (NWC)
                </p>
                {lnPerWallet.length === 1 ? (
                  <p className="mb-3 text-sm font-semibold text-foreground">
                    {lnPerWallet[0].label}
                  </p>
                ) : (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Total across {lnPerWallet.length} connected wallets
                  </p>
                )}
                <p className="text-2xl font-semibold tabular-nums">
                  {formatBTC(lnTotalSats)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">BTC total</p>
                <p className="mt-1 text-base tabular-nums text-muted-foreground">
                  {formatSats(lnTotalSats)} sats
                </p>
                <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                  {lnPerWallet.map((row) => (
                    <li
                      key={row.connectionId}
                      className="flex justify-between gap-2"
                    >
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {row.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {row.error != null ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            —
                          </span>
                        ) : (
                          formatSats(row.balanceSats)
                        )}{' '}
                        sats
                      </span>
                    </li>
                  ))}
                </ul>
                {lnPerWallet.some((r) => r.error != null) && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    Some Lightning wallets could not be reached; totals include
                    only successful responses.
                  </p>
                )}
              </div>
            )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
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
      const detail = err instanceof Error ? err.message : String(err)
      toast.error(detail || 'Sync failed')
    }
  }, [networkMode, activeWalletId, password, setWalletStatus])

  return (
    <InfomodeWrapper
      infoId="dashboard-sync-button"
      infoTitle="Sync"
      infoText="Fetches the latest data for your wallet from the configured Esplora server: new transactions, updated balances, and anything your addresses have done on-chain since the last refresh. Tap when you are expecting a payment or your activity looks out of date. On Lab network this button is hidden—the playground chain updates inside the lab instead of via this network sync."
    >
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={isSyncing}
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
        {isSyncing ? 'Syncing...' : 'Sync'}
      </Button>
    </InfomodeWrapper>
  )
}

function RecentTransactions() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const transactions = useWalletStore((s) => s.transactions)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const lightningEnabled = useFeatureStore((s) => s.lightningEnabled)
  const connectedLightningWallets = useLightningStore((s) => s.connectedWallets)
  const hasLnWalletForNetwork = useMemo(
    () =>
      hasNetworkConnectedWallet(
        connectedLightningWallets,
        activeWalletId,
        networkMode,
      ),
    [connectedLightningWallets, activeWalletId, networkMode],
  )
  const lnHistoryQuery = useLightningHistoryQuery()
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

  const mergedActivity = useMemo(() => {
    if (networkMode === 'lab') {
      return []
    }
    if (
      !lightningEnabled ||
      !isLightningSupported(networkMode) ||
      activeWalletId == null ||
      !hasLnWalletForNetwork
    ) {
      return mergeAndSortDashboardActivity(transactions, [])
    }
    return mergeAndSortDashboardActivity(
      transactions,
      lnHistoryQuery.data ?? [],
    )
  }, [
    networkMode,
    lightningEnabled,
    activeWalletId,
    hasLnWalletForNetwork,
    transactions,
    lnHistoryQuery.data,
  ])

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
        {networkMode !== 'lab' &&
          lightningEnabled &&
          hasLnWalletForNetwork &&
          lnHistoryQuery.isLoading && (
          <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Lightning activity…
          </p>
        )}
        {networkMode !== 'lab' && mergedActivity.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="rounded-full bg-muted p-3">
              <Wallet className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No activity yet. On-chain transactions appear after you sync;
              Lightning payments appear when your NWC wallet reports them.
            </p>
          </div>
        ) : networkMode === 'lab' && displayTransactions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="rounded-full bg-muted p-3">
              <Wallet className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No transactions yet. Mine blocks or send to see activity.
            </p>
          </div>
        ) : networkMode === 'lab' ? (
          <div className="space-y-2">
            {displayTransactions.slice(0, 10).map((tx) => (
              <TransactionItem key={tx.txid} transaction={tx} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {mergedActivity.slice(0, 10).map((item) =>
              item.kind === 'chain' ? (
                <TransactionItem key={item.tx.txid} transaction={item.tx} />
              ) : (
                <LightningPaymentItem
                  key={`${item.payment.connectionId}-${item.payment.paymentHash}`}
                  payment={item.payment}
                />
              ),
            )}
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
      <PageHeader title="Dashboard" icon={Home}>
        {lastSyncTime ? (
          <p className="text-xs text-muted-foreground">
            Last synced: {lastSyncTime.toLocaleTimeString()}
          </p>
        ) : null}
      </PageHeader>

      {walletStatus === 'syncing' && (
        <LoadingSpinner text="Syncing wallet..." />
      )}

      <BalanceCard />
      <RecentTransactions />
    </div>
  )
}
