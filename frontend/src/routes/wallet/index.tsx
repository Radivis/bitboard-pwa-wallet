import { useCallback, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Wallet,
  RefreshCw,
  Home,
  Loader2,
  ScanSearch,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useWalletStore,
  NETWORK_LABELS,
  type NetworkMode,
} from '@/stores/walletStore'
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
import { WalletUnlockOrNearZeroLoading } from '@/components/WalletUnlockOrNearZeroLoading'
import { TransactionItem } from '@/components/TransactionItem'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { balanceInfoToOnChainDisplay } from '@/lib/onchain-balance-display'
import {
  runIncrementalDashboardWalletSync,
  runFullScanDashboardWalletSync,
  retryImportInitialEsploraSyncWithWalletStatus,
} from '@/lib/wallet-utils'
import { labOwnersEqual, walletLabOwner } from '@/lib/lab-owner'
import { labTransactionsForWallet, lookupLabAddressOwner } from '@/lib/lab-utils'
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

function ImportInitialSyncErrorBanner() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const message = useWalletStore((s) => s.importInitialSyncErrorMessage)
  const setImportInitialSyncErrorMessage = useWalletStore(
    (s) => s.setImportInitialSyncErrorMessage,
  )
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const isSyncing = walletStatus === 'syncing'

  if (networkMode === 'lab' || message == null || message === '') {
    return null
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <AlertTriangle
          className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-500"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Initial sync did not finish
          </p>
          <p className="text-xs break-words text-muted-foreground">
            {message}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSyncing}
          onClick={() => {
            void retryImportInitialEsploraSyncWithWalletStatus()
          }}
        >
          {isSyncing ? 'Syncing...' : 'Retry'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={isSyncing}
          onClick={() => setImportInitialSyncErrorMessage(null)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  )
}

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
          .filter((u) => {
            const o = lookupLabAddressOwner(u.address, addressToOwner)
            return o != null && labOwnersEqual(o, walletLabOwner(activeWalletId))
          })
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
  const lightningBalanceRows = useMemo(
    () => lnBalancesQuery.data?.lightningBalanceRows ?? [],
    [lnBalancesQuery.data?.lightningBalanceRows],
  )
  const hasStaleLnBalance = lightningBalanceRows.some((r) => r.isStaleBalance)
  const newestStaleBalanceIso = useMemo(() => {
    const times = lightningBalanceRows
      .filter((r) => r.isStaleBalance && r.balanceSnapshotAt != null)
      .map((r) => r.balanceSnapshotAt as string)
    if (times.length === 0) return null
    return times.reduce((a, b) => (a > b ? a : b))
  }, [lightningBalanceRows])

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
            <BitcoinAmountDisplay amountSats={primarySats} size="lg" />
            {onChainDisplay.showBreakdown && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {onChainDisplay.confirmedSats > 0 && (
                  <li className="flex justify-between gap-2 text-muted-foreground">
                    <span>Spendable (settled)</span>
                    <span className="text-right">
                      <BitcoinAmountDisplay
                        amountSats={onChainDisplay.confirmedSats}
                        size="sm"
                        className="text-muted-foreground"
                      />
                    </span>
                  </li>
                )}
                {onChainDisplay.trustedPendingSats > 0 && (
                  <li className="flex justify-between gap-2 text-yellow-600 dark:text-yellow-400">
                    <span>Pending change</span>
                    <span className="text-right">
                      <BitcoinAmountDisplay
                        amountSats={onChainDisplay.trustedPendingSats}
                        size="sm"
                        className="text-yellow-600 dark:text-yellow-400"
                      />
                    </span>
                  </li>
                )}
                {onChainDisplay.untrustedPendingSats > 0 && (
                  <li className="flex justify-between gap-2 text-yellow-600 dark:text-yellow-400">
                    <span>Pending incoming</span>
                    <span className="text-right">
                      <BitcoinAmountDisplay
                        amountSats={onChainDisplay.untrustedPendingSats}
                        size="sm"
                        className="text-yellow-600 dark:text-yellow-400"
                      />
                    </span>
                  </li>
                )}
                {onChainDisplay.immatureSats > 0 && (
                  <li className="flex justify-between gap-2 text-muted-foreground">
                    <span>Immature</span>
                    <span className="text-right">
                      <BitcoinAmountDisplay
                        amountSats={onChainDisplay.immatureSats}
                        size="sm"
                        className="text-muted-foreground"
                      />
                    </span>
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
            lightningBalanceRows.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Lightning (NWC)
                </p>
                {lightningBalanceRows.length === 1 ? (
                  <p className="mb-3 text-sm font-semibold text-foreground">
                    {lightningBalanceRows[0].label}
                  </p>
                ) : (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Total across {lightningBalanceRows.length} connected wallets
                  </p>
                )}
                <BitcoinAmountDisplay
                  amountSats={lnTotalSats}
                  size="lg"
                  className="text-2xl"
                />
                <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                  {lightningBalanceRows.map((row) => (
                    <li
                      key={row.connectionId}
                      className="flex justify-between gap-2"
                    >
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {row.label}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {row.error != null && !row.isStaleBalance ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            —
                          </span>
                        ) : (
                          <>
                            <BitcoinAmountDisplay
                              amountSats={row.balanceSats}
                              size="sm"
                              className="inline text-muted-foreground"
                            />
                            {row.isStaleBalance ? (
                              <span
                                className="ml-1 text-xs font-normal text-amber-700 dark:text-amber-400"
                                data-testid="lightning-balance-cached-tag"
                              >
                                cached
                              </span>
                            ) : null}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {hasStaleLnBalance && (
                  <p
                    className="mt-2 text-xs text-amber-700 dark:text-amber-400"
                    data-testid="lightning-balance-stale-banner"
                  >
                    Showing last known Lightning balance saved in this app (not a
                    live check). NWC could not be reached.
                    {newestStaleBalanceIso != null && (
                      <>
                        {' '}
                        Updated:{' '}
                        {new Date(newestStaleBalanceIso).toLocaleString()}.
                      </>
                    )}
                  </p>
                )}
                {lightningBalanceRows.some((r) => r.error != null) && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    Some Lightning wallets could not be reached and have no saved
                    balance yet; those show “—” and are not included in the
                    total.
                  </p>
                )}
              </div>
            )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}

function SyncButton({
  isBusy,
  isThisOp,
  onThisOp,
}: {
  isBusy: boolean
  isThisOp: boolean
  onThisOp: (running: boolean) => void
}) {
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)
  const password = useSessionStore((s) => s.password)

  const handleSync = useCallback(async () => {
    try {
      onThisOp(true)
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
    } finally {
      onThisOp(false)
    }
  }, [networkMode, activeWalletId, password, onThisOp, setWalletStatus])

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
        disabled={isBusy}
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isThisOp ? 'animate-spin' : ''}`} />
        {isThisOp ? 'Syncing...' : 'Sync'}
      </Button>
    </InfomodeWrapper>
  )
}

const FULL_RESCAN_NETWORKS: NetworkMode[] = ['mainnet', 'testnet', 'signet']

function FullRescanButton({
  isBusy,
  isThisOp,
  onThisOp,
}: {
  isBusy: boolean
  isThisOp: boolean
  onThisOp: (running: boolean) => void
}) {
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)
  const password = useSessionStore((s) => s.password)

  const handleFullRescan = useCallback(async () => {
    try {
      onThisOp(true)
      setWalletStatus('syncing')
      await runFullScanDashboardWalletSync({
        networkMode,
        password,
        activeWalletId,
      })
      setWalletStatus('unlocked')
    } catch (err) {
      setWalletStatus('unlocked')
      const detail = err instanceof Error ? err.message : String(err)
      toast.error(detail || 'Full rescan failed')
    } finally {
      onThisOp(false)
    }
  }, [networkMode, activeWalletId, password, onThisOp, setWalletStatus])

  if (!FULL_RESCAN_NETWORKS.includes(networkMode)) {
    return null
  }

  return (
    <InfomodeWrapper
      infoId="dashboard-full-rescan-button"
      infoTitle="Full rescan"
      infoText="Re-scans a window of your addresses against Esplora (slower than Sync). Use if your balance or transaction list still looks wrong after a normal sync—for example a poor connection during restore."
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={handleFullRescan}
        disabled={isBusy}
        className="text-muted-foreground"
      >
        <ScanSearch className={`mr-2 h-4 w-4 ${isThisOp ? 'animate-pulse' : ''}`} />
        {isThisOp ? 'Scanning...' : 'Full rescan'}
      </Button>
    </InfomodeWrapper>
  )
}

function DashboardOnChainSyncControls() {
  const [activeOp, setActiveOp] = useState<'sync' | 'full' | null>(null)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const isBusy = walletStatus === 'syncing'

  return (
    <div className="flex flex-col items-end gap-2">
      <SyncButton
        isBusy={isBusy}
        isThisOp={activeOp === 'sync'}
        onThisOp={(running) => setActiveOp(running ? 'sync' : null)}
      />
      <FullRescanButton
        isBusy={isBusy}
        isThisOp={activeOp === 'full'}
        onThisOp={(running) => setActiveOp(running ? 'full' : null)}
      />
    </div>
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

  const lnPayments = useMemo(
    () => lnHistoryQuery.data?.payments ?? [],
    [lnHistoryQuery.data?.payments],
  )
  const stalePaymentsAsOf = lnHistoryQuery.data?.stalePaymentsAsOf

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
    return mergeAndSortDashboardActivity(transactions, lnPayments)
  }, [
    networkMode,
    lightningEnabled,
    activeWalletId,
    hasLnWalletForNetwork,
    transactions,
    lnPayments,
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
          {networkMode !== 'lab' && <DashboardOnChainSyncControls />}
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
        {networkMode !== 'lab' &&
          lightningEnabled &&
          hasLnWalletForNetwork &&
          stalePaymentsAsOf != null &&
          lnPayments.length > 0 && (
            <p
              className="mb-3 text-xs text-amber-700 dark:text-amber-400"
              data-testid="lightning-history-stale-banner"
            >
              Some Lightning activity below may be from the last successful sync
              in this app (NWC unreachable). List saved:{' '}
              {new Date(stalePaymentsAsOf).toLocaleString()}.
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
    return <WalletUnlockOrNearZeroLoading />
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

      <ImportInitialSyncErrorBanner />

      {walletStatus === 'syncing' && (
        <LoadingSpinner text="Syncing wallet..." />
      )}

      <BalanceCard />
      <RecentTransactions />
    </div>
  )
}
