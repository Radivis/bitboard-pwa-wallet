import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Wallet,
  Home,
  Loader2,
  ScanSearch,
} from 'lucide-react'
import {
  useWalletStore,
  NETWORK_LABELS,
  selectCommittedNetworkMode,
  type NetworkMode,
} from '@/stores/walletStore'
import {
  hasNetworkConnectedWallet,
  useLightningStore,
} from '@/stores/lightningStore'
import { PageHeader } from '@/components/PageHeader'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignBanner } from '@/components/design/DesignBanner'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { Badge } from '@/components/ui/badge'
import { CardPagination } from '@/components/CardPagination'
import { TransactionItem } from '@/components/TransactionItem'
import { BitcoinFiatDenominationSwitch } from '@/components/BitcoinFiatDenominationSwitch'
import { FiatBtcAmountDisplay } from '@/components/FiatBtcAmountDisplay'
import { OnchainSaveErrorBanner } from '@/pages/wallet/OnchainSaveErrorBanner'
import { balanceInfoToOnChainDisplay } from '@/lib/wallet/onchain-balance-display'
import { retryInitialEsploraSyncWithWalletStatus } from '@/lib/wallet/wallet-utils'
import { labTransactionsForWallet, sumLabWalletUtxoSats } from '@/lib/lab/lab-utils'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import { useLightningHistoryQuery } from '@/hooks/useLightningMutations'
import {
  useOnchainEsploraSyncMetadataQuery,
} from '@/hooks/useOnchainDashboardQueries'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { isLightningSupported } from '@/lib/lightning/lightning-utils'
import { mergeAndSortDashboardActivity } from '@/lib/lightning/lightning-dashboard-sync'
import { useDashboardActivityPageSize } from '@/hooks/useDashboardActivityPageSize'
import { LightningPaymentItem } from '@/components/LightningPaymentItem'
import { ArkadePaymentItem } from '@/components/ArkadePaymentItem'
import { BarkMovementItem } from '@/components/BarkMovementItem'
import { ArkadeDashboardBalance } from '@/components/wallet/ArkadeDashboardBalance'
import { BarkDashboardBalance, isBarkDashboardBalanceVisible } from '@/components/wallet/BarkDashboardBalance'
import {
  LightningDashboardBalance,
  useIsLightningDashboardBalanceShown,
} from '@/components/wallet/LightningDashboardBalance'
import { RailLoadErrorBanner } from '@/components/wallet/RailLoadErrorBanner'
import { RailSyncControl } from '@/components/wallet/RailSyncControl'
import { RailSyncErrorBanner } from '@/components/wallet/RailSyncErrorBanner'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useOnchainRailSnapshot } from '@/hooks/useOnchainLifecycleSnapshots'
import {
  useOnchainLoadLifecycleSnapshot,
  useOnchainSyncLifecycleSnapshot,
} from '@/hooks/useOnchainLifecycleSnapshots'
import { orchestrateOnchainRetryLoad } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import {
  useOnchainIncrementalSyncMutation,
  useOnchainFullRescanSyncMutation,
} from '@/hooks/useRailManualSyncMutations'
import { useArkadeHistoryQuery } from '@/hooks/useArkadeQueries'
import { useBarkHistoryQuery } from '@/hooks/useBarkHistoryQuery'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { useMainnetFiatAmountProps } from '@/hooks/useMainnetFiatAmountProps'
import {
  LAB_WALLET_BALANCE_DISCLAIMER,
  walletBalanceCardTitle,
  walletDashboardTitle,
  walletOnChainSectionLabel,
} from '@/lib/wallet/wallet-lab-ui-copy'

function InitialSyncErrorBanner() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const message = useWalletStore((walletState) => walletState.initialSyncErrorMessage)
  const setInitialSyncErrorMessage = useWalletStore(
    (walletState) => walletState.setInitialSyncErrorMessage,
  )
  const onchainSyncPhase = useOnchainSyncLifecycleSnapshot().syncPhase
  const isOnchainSyncing = onchainSyncPhase === 'syncing'

  if (networkMode === 'lab' || message == null || message === '') {
    return null
  }

  return (
    <DesignBanner
      role="alert"
      status="warning"
      title="Initial sync did not finish"
      description={message}
      primaryAction={{
        label: isOnchainSyncing ? 'Syncing...' : 'Retry',
        onClick: () => {
          void retryInitialEsploraSyncWithWalletStatus()
        },
        disabled: isOnchainSyncing,
      }}
      secondaryAction={{
        label: 'Dismiss',
        onClick: () => setInitialSyncErrorMessage(null),
        disabled: isOnchainSyncing,
      }}
    />
  )
}

/** Live Esplora networks; regtest included so developers can repair after bad local chain. */
const FULL_RESCAN_NETWORKS: NetworkMode[] = ['mainnet', 'testnet', 'signet', 'mutinynet']

function BalanceDesignCard({
  hasCompanionRailBalance,
}: {
  hasCompanionRailBalance: boolean
}) {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const balance = useWalletStore((walletState) => walletState.balance)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const onchainEsploraSyncQuery = useOnchainEsploraSyncMetadataQuery()
  const onchainRail = useOnchainRailSnapshot()
  const onchainLoadSnapshot = useOnchainLoadLifecycleSnapshot()
  const onchainSyncSnapshot = useOnchainSyncLifecycleSnapshot()
  const onchainIncrementalSync = useOnchainIncrementalSyncMutation()
  const onchainFullRescanSync = useOnchainFullRescanSyncMutation()
  const { data: labState, isPending: labChainPending } = useLabChainStateQuery()
  const utxos = labState?.utxos ?? []
  const addressToOwner = labState?.addressToOwner ?? {}
  const labChainReady = networkMode === 'lab' && labState != null && !labChainPending

  const labBalanceSats =
    networkMode === 'lab' && activeWalletId != null && labChainReady
      ? sumLabWalletUtxoSats(utxos, addressToOwner, activeWalletId)
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
  const isStaleOnchain =
    (onchainEsploraSyncQuery.data?.isStaleOnchain ?? false) &&
    onchainRail.syncPhase !== 'sync-error'
  const lastSuccessfulEsploraSyncAt =
    onchainEsploraSyncQuery.data?.lastSuccessfulEsploraSyncAt

  const fiatAmount = useMainnetFiatAmountProps()
  const fiatAmountProps = {
    showFiatLayout: fiatAmount.showFiatLayout,
    btcPriceInFiat: fiatAmount.btcPriceInFiat,
    currency: fiatAmount.currency,
    rateLoading: fiatAmount.rateLoading,
  }

  return (
    <InfomodeWrapper
      infoId="dashboard-balance-card"
      infoTitle="Balance"
      infoText="This is your on-chain Bitcoin on the network shown in the badge. The headline is your total balance (everything the wallet counts toward that total). When something is still unconfirmed, you may see a breakdown: spendable (settled in a block), pending change (value returning from a send you made), and pending incoming (someone else’s payment to you not yet confirmed). Immature appears rarely (e.g. mining rewards before they mature). On Labnet, the total comes from the simulator’s coins tied to your wallet instead of the live Esplora-backed ledger."
      className="rounded-xl"
    >
      <DesignCard>
        <DesignCardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DesignCardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              {walletBalanceCardTitle(networkMode, hasCompanionRailBalance)}
            </DesignCardTitle>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {networkMode === 'mainnet' ? (
                <BitcoinFiatDenominationSwitch className="shrink-0" />
              ) : null}
              <Badge variant="outline">{NETWORK_LABELS[networkMode]}</Badge>
            </div>
          </div>
          {networkMode === 'lab' ? (
            <p className="design-type-emphasis text-foreground">
              {LAB_WALLET_BALANCE_DISCLAIMER}
            </p>
          ) : null}
        </DesignCardHeader>
        <DesignCardContent className="space-y-6">
          <div
            data-rail-onchain-load={onchainRail.loadPhase}
            data-rail-onchain-sync={onchainRail.syncPhase}
          >
            {hasCompanionRailBalance ? null : (
              <p className="design-type-metadata mb-2 uppercase text-muted-foreground">
                {walletOnChainSectionLabel(networkMode)}
              </p>
            )}
            {onchainLoadSnapshot.loadPhase === 'load-error' ? (
              <RailLoadErrorBanner
                rail="onchain"
                loadPhase={onchainLoadSnapshot.loadPhase}
                errorMessage={onchainLoadSnapshot.errorMessage}
                onRetry={() => {
                  void orchestrateOnchainRetryLoad()
                }}
              />
            ) : (
              <>
                <FiatBtcAmountDisplay
                  amountSats={primarySats}
                  {...fiatAmountProps}
                  amountTypography="largeBalances"
                  data-testid="dashboard-onchain-balance-amount"
                />
                {networkMode !== 'lab' && isStaleOnchain ? (
                  <DesignBanner
                    role="status"
                    status="warning"
                    className="mt-2"
                    data-testid="onchain-esplora-stale-banner"
                    title="Showing saved chain state"
                    description={
                      <>
                        Showing on-chain data from your wallet&apos;s saved chain state. Esplora
                        has not been verified this session.
                        {lastSuccessfulEsploraSyncAt != null && (
                          <>
                            {' '}
                            Last verified with Esplora:{' '}
                            {new Date(lastSuccessfulEsploraSyncAt).toLocaleString()}.
                          </>
                        )}
                      </>
                    }
                  />
                ) : null}
            {onChainDisplay.showBreakdown && (
              <ul className="design-type-regular mt-3 space-y-1.5">
                {onChainDisplay.confirmedSats > 0 && (
                  <li className="flex justify-between gap-2 text-muted-foreground">
                    <span>Spendable (settled)</span>
                    <span className="text-right">
                      <FiatBtcAmountDisplay
                        amountSats={onChainDisplay.confirmedSats}
                        {...fiatAmountProps}
                        isDetail
                        amountTypography="smallBalances"
                        className="text-muted-foreground"
                      />
                    </span>
                  </li>
                )}
                {onChainDisplay.trustedPendingSats > 0 && (
                  <li className="flex justify-between gap-2 text-yellow-600 dark:text-yellow-400">
                    <span>Pending change</span>
                    <span className="text-right">
                      <FiatBtcAmountDisplay
                        amountSats={onChainDisplay.trustedPendingSats}
                        {...fiatAmountProps}
                        isDetail
                        amountTypography="smallBalances"
                        className="text-yellow-600 dark:text-yellow-400"
                      />
                    </span>
                  </li>
                )}
                {onChainDisplay.untrustedPendingSats > 0 && (
                  <li className="flex justify-between gap-2 text-yellow-600 dark:text-yellow-400">
                    <span>Pending incoming</span>
                    <span className="text-right">
                      <FiatBtcAmountDisplay
                        amountSats={onChainDisplay.untrustedPendingSats}
                        {...fiatAmountProps}
                        isDetail
                        amountTypography="smallBalances"
                        className="text-yellow-600 dark:text-yellow-400"
                      />
                    </span>
                  </li>
                )}
                {onChainDisplay.immatureSats > 0 && (
                  <li className="flex justify-between gap-2 text-muted-foreground">
                    <span>Immature</span>
                    <span className="text-right">
                      <FiatBtcAmountDisplay
                        amountSats={onChainDisplay.immatureSats}
                        {...fiatAmountProps}
                        isDetail
                        amountTypography="smallBalances"
                        className="text-muted-foreground"
                      />
                    </span>
                  </li>
                )}
              </ul>
            )}
            {networkMode !== 'lab' && (
              <>
                <RailSyncErrorBanner
                  rail="onchain"
                  syncPhase={onchainSyncSnapshot.syncPhase}
                  loadPhase={onchainLoadSnapshot.loadPhase}
                  errorMessage={onchainSyncSnapshot.errorMessage}
                  onRetry={() => onchainIncrementalSync.mutate()}
                  isRetrying={
                    onchainRail.syncPhase === 'syncing' || onchainIncrementalSync.isPending
                  }
                />
                <RailSyncControl
                  rail="onchain"
                  syncLabel="Sync on-chain"
                  syncPhase={onchainRail.syncPhase}
                  lastSyncedAt={lastSuccessfulEsploraSyncAt ?? null}
                  onSync={() => onchainIncrementalSync.mutate()}
                  isSyncPending={onchainIncrementalSync.isPending}
                  railConfigured={onchainRail.loadPhase !== 'not-configured'}
                  syncErrorMessage={onchainSyncSnapshot.errorMessage}
                  syncErrorDetailInBanner={onchainLoadSnapshot.loadPhase === 'loaded'}
                  secondaryAction={
                  FULL_RESCAN_NETWORKS.includes(networkMode) ? (
                    <InfomodeWrapper
                      infoId="dashboard-full-rescan-button"
                      infoTitle="Full rescan"
                      infoText="Re-scans a window of your addresses against Esplora (slower than Sync). Use if your balance or transaction list still looks wrong after a normal sync—for example a poor connection during restore."
                    >
                      <DesignButton
                        type="button"
                        appearance="tertiary"
                        onClick={() => onchainFullRescanSync.mutate()}
                        disabled={
                          onchainRail.syncPhase === 'syncing' ||
                          onchainFullRescanSync.isPending
                        }
                        data-testid="rail-sync-onchain-full-rescan"
                        icon={
                          <ScanSearch
                            className={onchainFullRescanSync.isPending ? 'animate-pulse' : undefined}
                            aria-hidden
                          />
                        }
                      >
                        {onchainFullRescanSync.isPending ? 'Scanning…' : 'Full rescan'}
                      </DesignButton>
                    </InfomodeWrapper>
                  ) : null
                }
                />
              </>
            )}
              </>
            )}
          </div>
        </DesignCardContent>
      </DesignCard>
    </InfomodeWrapper>
  )
}

function useHasCompanionRailBalance(): boolean {
  const committedNetworkMode = useWalletStore(selectCommittedNetworkMode)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const barkLoadPhase = useBarkLoadLifecycleSnapshot().loadPhase
  const lightningShown = useIsLightningDashboardBalanceShown()
  const arkadeShown = isArkadeActiveForNetworkMode(committedNetworkMode)
  const barkShown = isBarkDashboardBalanceVisible({
    networkMode: committedNetworkMode,
    isBarkEnabled,
    loadPhase: barkLoadPhase,
  })
  return arkadeShown || barkShown || lightningShown
}

function RecentTransactions() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const transactions = useWalletStore((walletState) => walletState.transactions)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const connectedLightningWallets = useLightningStore((lightningState) => lightningState.connectedWallets)
  const hasLnWalletForNetwork = useMemo(
    () =>
      hasNetworkConnectedWallet(
        connectedLightningWallets,
        activeWalletId,
        networkMode,
      ),
    [connectedLightningWallets, activeWalletId, networkMode],
  )
  const lightningHistoryQuery = useLightningHistoryQuery()
  const arkadeActive = isArkadeActiveForNetworkMode(networkMode)
  const arkadeHistoryQuery = useArkadeHistoryQuery()
  const barkHistoryQuery = useBarkHistoryQuery()
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

  const lightningPayments = useMemo(
    () => lightningHistoryQuery.data?.payments ?? [],
    [lightningHistoryQuery.data?.payments],
  )
  const arkadePayments = useMemo(
    () => (arkadeActive ? arkadeHistoryQuery.data ?? [] : []),
    [arkadeActive, arkadeHistoryQuery.data],
  )
  const barkActive = isBarkEnabled && isBarkNetworkMode(networkMode)
  const barkMovements = useMemo(
    () => (barkActive ? barkHistoryQuery.data ?? [] : []),
    [barkActive, barkHistoryQuery.data],
  )
  const stalePaymentsAsOf = lightningHistoryQuery.data?.stalePaymentsAsOf

  const mergedActivity = useMemo(() => {
    if (networkMode === 'lab') {
      return []
    }
    const lightningForMerge =
      isLightningEnabled &&
      isLightningSupported(networkMode) &&
      activeWalletId != null &&
      hasLnWalletForNetwork
        ? lightningPayments
        : []
    return mergeAndSortDashboardActivity(
      transactions,
      lightningForMerge,
      arkadePayments,
      barkMovements,
    )
  }, [
    networkMode,
    isLightningEnabled,
    activeWalletId,
    hasLnWalletForNetwork,
    transactions,
    lightningPayments,
    arkadePayments,
    barkMovements,
  ])

  const activityTotalCount =
    networkMode === 'lab' ? displayTransactions.length : mergedActivity.length

  const activityPageSize = useDashboardActivityPageSize()
  const [pageIndex, setPageIndex] = useState(0)

  useEffect(() => {
    setPageIndex(0)
  }, [activeWalletId, networkMode])

  useEffect(() => {
    setPageIndex(0)
  }, [activityPageSize])

  const maxPage = Math.max(
    0,
    Math.ceil(activityTotalCount / activityPageSize) - 1,
  )
  useEffect(() => {
    if (pageIndex > maxPage) setPageIndex(maxPage)
  }, [maxPage, pageIndex])

  const labPageRows = useMemo(() => {
    const start = pageIndex * activityPageSize
    return displayTransactions.slice(start, start + activityPageSize)
  }, [displayTransactions, pageIndex, activityPageSize])

  const mergedPageRows = useMemo(() => {
    const start = pageIndex * activityPageSize
    return mergedActivity.slice(start, start + activityPageSize)
  }, [mergedActivity, pageIndex, activityPageSize])

  if (networkMode === 'lab' && !labChainReady) {
    return (
      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle>Recent Transactions</DesignCardTitle>
        </DesignCardHeader>
        <DesignCardContent>
          <p className="design-type-regular text-muted-foreground py-4">
            Loading lab...
          </p>
        </DesignCardContent>
      </DesignCard>
    )
  }

  return (
    <DesignCard>
      <DesignCardHeader>
        <DesignCardTitle>Recent Transactions</DesignCardTitle>
      </DesignCardHeader>
      <DesignCardContent>
        {networkMode !== 'lab' &&
          isLightningEnabled &&
          hasLnWalletForNetwork &&
          lightningHistoryQuery.isLoading && (
          <p className="design-type-regular mb-3 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Lightning activity…
          </p>
        )}
        {networkMode !== 'lab' && arkadeActive && arkadeHistoryQuery.isLoading && (
          <p className="design-type-regular mb-3 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Arkade activity…
          </p>
        )}
        {networkMode !== 'lab' && barkActive && barkHistoryQuery.isLoading && (
          <p className="design-type-regular mb-3 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Bark activity…
          </p>
        )}
        {networkMode !== 'lab' &&
          isLightningEnabled &&
          hasLnWalletForNetwork &&
          stalePaymentsAsOf != null &&
          lightningPayments.length > 0 && (
            <DesignBanner
              role="status"
              status="warning"
              className="mb-3"
              data-testid="lightning-history-stale-banner"
              title="Lightning activity may be out of date"
              description={
                <>
                  Some Lightning activity below may be from the last successful sync in this app
                  (NWC unreachable). List saved: {new Date(stalePaymentsAsOf).toLocaleString()}.
                </>
              }
            />
          )}
        {networkMode !== 'lab' && mergedActivity.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="rounded-full bg-muted p-3">
              <Wallet className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="design-type-regular text-muted-foreground">
              No activity yet. On-chain transactions appear after you sync;
              Arkade payments appear when your Arkade session is open;
              Lightning payments appear when your NWC wallet reports them
              {barkActive ? '; Bark movements appear after Bark history loads' : ''}.
            </p>
          </div>
        ) : networkMode === 'lab' && displayTransactions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="rounded-full bg-muted p-3">
              <Wallet className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="design-type-regular text-muted-foreground">
              No transactions yet. Mine blocks or send to see activity.
            </p>
          </div>
        ) : (
          <CardPagination
            pageSize={activityPageSize}
            totalCount={activityTotalCount}
            pageIndex={pageIndex}
            onPageChange={setPageIndex}
            ariaLabel="Transaction activity page"
          >
            <div className="space-y-2">
              {networkMode === 'lab'
                ? labPageRows.map((tx) => (
                    <TransactionItem key={tx.txid} transaction={tx} />
                  ))
                : mergedPageRows.map((activityItem) => {
                    if (activityItem.kind === 'chain') {
                      return (
                        <TransactionItem
                          key={activityItem.tx.txid}
                          transaction={activityItem.tx}
                          activityLabel={activityItem.activityLabel}
                        />
                      )
                    }
                    if (activityItem.kind === 'lightning') {
                      return (
                        <LightningPaymentItem
                          key={`${activityItem.payment.connectionId}-${activityItem.payment.paymentHash}`}
                          payment={activityItem.payment}
                        />
                      )
                    }
                    if (activityItem.kind === 'bark') {
                      return (
                        <BarkMovementItem
                          key={`bark-${activityItem.movement.id}`}
                          movement={activityItem.movement}
                        />
                      )
                    }
                    return (
                      <ArkadePaymentItem
                        key={`arkade-${activityItem.payment.txid}-${activityItem.payment.timestamp}`}
                        payment={activityItem.payment}
                        activityLabel={activityItem.activityLabel}
                      />
                    )
                  })}
            </div>
          </CardPagination>
        )}
      </DesignCardContent>
    </DesignCard>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const hasCompanionRailBalance = useHasCompanionRailBalance()

  if (!activeWalletId) {
    navigate({ to: '/setup' })
    return null
  }

  return (
    <div className="space-y-6">
      <PageHeader title={walletDashboardTitle(networkMode)} icon={Home} variant="area" />

      <InitialSyncErrorBanner />
      <OnchainSaveErrorBanner />

      <BalanceDesignCard hasCompanionRailBalance={hasCompanionRailBalance} />
      <ArkadeDashboardBalance />
      <BarkDashboardBalance />
      <LightningDashboardBalance />
      <RecentTransactions />
    </div>
  )
}
