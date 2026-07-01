import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Wallet,
  Home,
  Loader2,
  ScanSearch,
  AlertTriangle,
} from 'lucide-react'
import {
  useWalletStore,
  NETWORK_LABELS,
  type NetworkMode,
} from '@/stores/walletStore'
import {
  hasNetworkConnectedWallet,
  useLightningStore,
} from '@/stores/lightningStore'
import { PageHeader } from '@/components/PageHeader'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WalletUnlockOrNearZeroLoading } from '@/components/WalletUnlockOrNearZeroLoading'
import { CardPagination } from '@/components/CardPagination'
import { TransactionItem } from '@/components/TransactionItem'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { BitcoinFiatDenominationSwitch } from '@/components/BitcoinFiatDenominationSwitch'
import { FiatAmountDisplay } from '@/components/FiatAmountDisplay'
import { OnchainSaveErrorBanner } from '@/pages/wallet/OnchainSaveErrorBanner'
import { balanceInfoToOnChainDisplay } from '@/lib/wallet/onchain-balance-display'
import { retryImportInitialEsploraSyncWithWalletStatus } from '@/lib/wallet/wallet-utils'
import { labTransactionsForWallet, sumLabWalletUtxoSats } from '@/lib/lab/lab-utils'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import {
  useLightningBalancesForDashboardQuery,
  useLightningHistoryQuery,
} from '@/hooks/useLightningMutations'
import {
  useOnchainEsploraSyncMetadataQuery,
} from '@/hooks/useOnchainDashboardQueries'
import { useFeatureStore } from '@/stores/featureStore'
import { isLightningSupported } from '@/lib/lightning/lightning-utils'
import { mergeAndSortDashboardActivity } from '@/lib/lightning/lightning-dashboard-sync'
import { useDashboardActivityPageSize } from '@/hooks/useDashboardActivityPageSize'
import { LightningPaymentItem } from '@/components/LightningPaymentItem'
import { ArkadePaymentItem } from '@/components/ArkadePaymentItem'
import { ArkadeDashboardBalance } from '@/components/wallet/ArkadeDashboardBalance'
import { RailLoadErrorBanner } from '@/components/wallet/RailLoadErrorBanner'
import { RailSyncControl } from '@/components/wallet/RailSyncControl'
import { RailSyncErrorBanner } from '@/components/wallet/RailSyncErrorBanner'
import { useOnchainRailSnapshot } from '@/hooks/useOnchainLifecycleSnapshots'
import { useLightningRailSnapshot } from '@/hooks/useLightningLifecycleSnapshots'
import {
  useOnchainLoadLifecycleSnapshot,
  useOnchainSyncLifecycleSnapshot,
} from '@/hooks/useOnchainLifecycleSnapshots'
import {
  useLightningLoadLifecycleSnapshot,
  useLightningSyncLifecycleSnapshot,
} from '@/hooks/useLightningLifecycleSnapshots'
import { orchestrateOnchainRetryLoad } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import { orchestrateLightningRetryLoad } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'
import {
  useOnchainIncrementalSyncMutation,
  useOnchainFullRescanSyncMutation,
  useLightningManualSyncMutation,
} from '@/hooks/useRailManualSyncMutations'
import { useLightningSyncMetadataQuery } from '@/hooks/useLightningDashboardQueries'
import { useArkadeHistoryQuery } from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { useMainnetFiatRatesQuery } from '@/hooks/useMainnetFiatRatesQuery'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import {
  LAB_WALLET_BALANCE_DISCLAIMER,
  walletBalanceCardTitle,
  walletDashboardTitle,
  walletOnChainSectionLabel,
} from '@/lib/wallet/wallet-lab-ui-copy'

function ImportInitialSyncErrorBanner() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const message = useWalletStore((walletState) => walletState.importInitialSyncErrorMessage)
  const setImportInitialSyncErrorMessage = useWalletStore(
    (walletState) => walletState.setImportInitialSyncErrorMessage,
  )
  const onchainSyncPhase = useOnchainSyncLifecycleSnapshot().syncPhase
  const isOnchainSyncing = onchainSyncPhase === 'syncing'

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
          disabled={isOnchainSyncing}
          onClick={() => {
            void retryImportInitialEsploraSyncWithWalletStatus()
          }}
        >
          {isOnchainSyncing ? 'Syncing...' : 'Retry'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={isOnchainSyncing}
          onClick={() => setImportInitialSyncErrorMessage(null)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  )
}

/** Live Esplora networks; regtest included so developers can repair after bad local chain. */
const FULL_RESCAN_NETWORKS: NetworkMode[] = ['mainnet', 'testnet', 'signet']

function BalanceCard() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const balance = useWalletStore((walletState) => walletState.balance)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const connectedLightningWallets = useLightningStore((lightningState) => lightningState.connectedWallets)
  const lightningBalancesQuery = useLightningBalancesForDashboardQuery()
  const onchainEsploraSyncQuery = useOnchainEsploraSyncMetadataQuery()
  const onchainRail = useOnchainRailSnapshot()
  const onchainLoadSnapshot = useOnchainLoadLifecycleSnapshot()
  const onchainSyncSnapshot = useOnchainSyncLifecycleSnapshot()
  const lightningRail = useLightningRailSnapshot()
  const lightningLoadSnapshot = useLightningLoadLifecycleSnapshot()
  const lightningSyncSnapshot = useLightningSyncLifecycleSnapshot()
  const lightningSyncMetadataQuery = useLightningSyncMetadataQuery()
  const onchainIncrementalSync = useOnchainIncrementalSyncMutation()
  const onchainFullRescanSync = useOnchainFullRescanSyncMutation()
  const lightningManualSync = useLightningManualSyncMutation()
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

  const hasMatchingLightningConnection = useMemo(
    () =>
      isLightningEnabled &&
      networkMode !== 'lab' &&
      hasNetworkConnectedWallet(
        connectedLightningWallets,
        activeWalletId,
        networkMode,
      ),
    [
      isLightningEnabled,
      networkMode,
      activeWalletId,
      connectedLightningWallets,
    ],
  )

  const showLightningBalances = hasMatchingLightningConnection

  const isLightningBalancesSectionLoading =
    showLightningBalances &&
    lightningRail.loadPhase !== 'load-error' &&
    (lightningRail.loadPhase !== 'loaded' || lightningBalancesQuery.isLoading)

  const lightningTotalSats = lightningBalancesQuery.data?.totalSats ?? 0
  const lightningBalanceRows = useMemo(
    () => lightningBalancesQuery.data?.lightningBalanceRows ?? [],
    [lightningBalancesQuery.data?.lightningBalanceRows],
  )
  const hasStaleLightningBalance = lightningBalanceRows.some(
    (balanceRow) => balanceRow.isStaleBalance,
  )
  const showLightningLoadError = lightningLoadSnapshot.loadPhase === 'load-error'
  const showLightningBalancesSection =
    showLightningLoadError ||
    (showLightningBalances &&
      lightningBalancesQuery.isSuccess &&
      lightningBalanceRows.length > 0)
  const newestStaleBalanceIso = useMemo(() => {
    const times = lightningBalanceRows
      .filter(
        (balanceRow) => balanceRow.isStaleBalance && balanceRow.balanceSnapshotAt != null,
      )
      .map((balanceRow) => balanceRow.balanceSnapshotAt as string)
    if (times.length === 0) return null
    return times.reduce((newerIso, olderIso) => (newerIso > olderIso ? newerIso : olderIso))
  }, [lightningBalanceRows])

  const fiatDenominationMode = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.fiatDenominationMode,
  )
  const defaultFiatCurrency = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.defaultFiatCurrency,
  )
  const fiatRatesQuery = useMainnetFiatRatesQuery()
  const btcPriceInFiat = fiatRatesQuery.data?.btcPriceInFiat
  const mainnetFiatLayout =
    networkMode === 'mainnet' && fiatDenominationMode

  function renderOnChainHeadline() {
    if (mainnetFiatLayout) {
      return (
        <>
          <div className="space-y-1">
            <FiatAmountDisplay
              amountSats={primarySats}
              btcPriceInFiat={btcPriceInFiat}
              currency={defaultFiatCurrency}
              size="lg"
              data-testid="dashboard-onchain-balance-amount"
              rateLoading={fiatRatesQuery.isPending}
            />
          </div>
          <div className="space-y-1">
            <BitcoinAmountDisplay
              amountSats={primarySats}
              size="md"
              allowUnitToggle={false}
              className="text-muted-foreground"
            />
          </div>
        </>
      )
    }
    return (
      <BitcoinAmountDisplay
        amountSats={primarySats}
        size="lg"
        data-testid="dashboard-onchain-balance-amount"
      />
    )
  }

  function renderLightningTotalHeadline() {
    if (mainnetFiatLayout) {
      return (
        <>
          <div className="space-y-1">
            <FiatAmountDisplay
              amountSats={lightningTotalSats}
              btcPriceInFiat={btcPriceInFiat}
              currency={defaultFiatCurrency}
              size="lg"
              className="text-2xl"
              rateLoading={fiatRatesQuery.isPending}
            />
          </div>
          <div className="space-y-1">
            <BitcoinAmountDisplay
              amountSats={lightningTotalSats}
              size="md"
              allowUnitToggle={false}
              className="text-xl text-muted-foreground"
            />
          </div>
        </>
      )
    }
    return (
      <BitcoinAmountDisplay
        amountSats={lightningTotalSats}
        size="lg"
        className="text-2xl"
      />
    )
  }

  return (
    <InfomodeWrapper
      infoId="dashboard-balance-card"
      infoTitle="Balance"
      infoText="This is your on-chain Bitcoin on the network shown in the badge. The headline is your total balance (everything the wallet counts toward that total). When something is still unconfirmed, you may see a breakdown: spendable (settled in a block), pending change (value returning from a send you made), and pending incoming (someone else’s payment to you not yet confirmed). Immature appears rarely (e.g. mining rewards before they mature). On Lab mode, the total comes from the simulator’s coins tied to your wallet instead of the live Esplora-backed ledger."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              {walletBalanceCardTitle(networkMode)}
            </CardTitle>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {networkMode === 'mainnet' ? (
                <BitcoinFiatDenominationSwitch className="shrink-0" />
              ) : null}
              <Badge variant="outline">{NETWORK_LABELS[networkMode]}</Badge>
            </div>
          </div>
          {networkMode === 'lab' ? (
            <p className="text-sm font-bold text-foreground">
              {LAB_WALLET_BALANCE_DISCLAIMER}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          <div
            data-rail-onchain-load={onchainRail.loadPhase}
            data-rail-onchain-sync={onchainRail.syncPhase}
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {walletOnChainSectionLabel(networkMode)}
            </p>
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
                {renderOnChainHeadline()}
                {networkMode !== 'lab' && isStaleOnchain ? (
              <p
                className="mt-2 text-xs text-amber-700 dark:text-amber-400"
                data-testid="onchain-esplora-stale-banner"
              >
                Showing on-chain data from your wallet&apos;s saved chain state.
                Esplora has not been verified this session.
                {lastSuccessfulEsploraSyncAt != null && (
                  <>
                    {' '}
                    Last verified with Esplora:{' '}
                    {new Date(lastSuccessfulEsploraSyncAt).toLocaleString()}.
                  </>
                )}
              </p>
            ) : null}
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onchainFullRescanSync.mutate()}
                        disabled={
                          onchainRail.syncPhase === 'syncing' ||
                          onchainFullRescanSync.isPending
                        }
                        className="text-muted-foreground"
                        data-testid="rail-sync-onchain-full-rescan"
                      >
                        <ScanSearch
                          className={`mr-2 h-4 w-4 ${onchainFullRescanSync.isPending ? 'animate-pulse' : ''}`}
                          aria-hidden
                        />
                        {onchainFullRescanSync.isPending ? 'Scanning…' : 'Full rescan'}
                      </Button>
                    </InfomodeWrapper>
                  ) : null
                }
                />
              </>
            )}
              </>
            )}
          </div>

          <ArkadeDashboardBalance />

          {isLightningBalancesSectionLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Lightning balances…
            </div>
          )}

          {showLightningBalancesSection && (
              <div
                data-rail-lightning-load={lightningRail.loadPhase}
                data-rail-lightning-sync={lightningRail.syncPhase}
              >
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Lightning (NWC)
                </p>
                {showLightningLoadError ? (
                  <RailLoadErrorBanner
                    rail="lightning"
                    loadPhase={lightningLoadSnapshot.loadPhase}
                    errorMessage={lightningLoadSnapshot.errorMessage}
                    onRetry={() => {
                      void orchestrateLightningRetryLoad()
                    }}
                  />
                ) : (
                  <>
                {lightningBalanceRows.length === 1 ? (
                  <p className="mb-3 text-sm font-semibold text-foreground">
                    {lightningBalanceRows[0].label}
                  </p>
                ) : (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Total across {lightningBalanceRows.length} connected wallets
                  </p>
                )}
                {renderLightningTotalHeadline()}
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
                {hasStaleLightningBalance && (
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
                {lightningBalanceRows.some((balanceRow) => balanceRow.error != null) && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    Some Lightning wallets could not be reached and have no saved
                    balance yet; those show “—” and are not included in the
                    total.
                  </p>
                )}
                <RailSyncErrorBanner
                  rail="lightning"
                  syncPhase={lightningSyncSnapshot.syncPhase}
                  loadPhase={lightningLoadSnapshot.loadPhase}
                  errorMessage={lightningSyncSnapshot.errorMessage}
                  onRetry={() => lightningManualSync.mutate()}
                  isRetrying={
                    lightningRail.syncPhase === 'syncing' || lightningManualSync.isPending
                  }
                />
                <RailSyncControl
                  rail="lightning"
                  syncLabel="Sync Lightning"
                  syncPhase={lightningRail.syncPhase}
                  lastSyncedAt={lightningSyncMetadataQuery.data?.lastSyncedAt ?? null}
                  onSync={() => lightningManualSync.mutate()}
                  isSyncPending={lightningManualSync.isPending}
                  railConfigured={lightningRail.loadPhase !== 'not-configured'}
                  syncErrorMessage={lightningSyncSnapshot.errorMessage}
                  syncErrorDetailInBanner={lightningLoadSnapshot.loadPhase === 'loaded'}
                />
                  </>
                )}
              </div>
            )}
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}

function RecentTransactions() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const transactions = useWalletStore((walletState) => walletState.transactions)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
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
    return mergeAndSortDashboardActivity(transactions, lightningForMerge, arkadePayments)
  }, [
    networkMode,
    isLightningEnabled,
    activeWalletId,
    hasLnWalletForNetwork,
    transactions,
    lightningPayments,
    arkadePayments,
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
        <CardTitle>Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        {networkMode !== 'lab' &&
          isLightningEnabled &&
          hasLnWalletForNetwork &&
          lightningHistoryQuery.isLoading && (
          <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Lightning activity…
          </p>
        )}
        {networkMode !== 'lab' && arkadeActive && arkadeHistoryQuery.isLoading && (
          <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Arkade activity…
          </p>
        )}
        {networkMode !== 'lab' &&
          isLightningEnabled &&
          hasLnWalletForNetwork &&
          stalePaymentsAsOf != null &&
          lightningPayments.length > 0 && (
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
              Arkade payments appear when your Arkade session is open;
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
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)

  if (!activeWalletId) {
    navigate({ to: '/setup' })
    return null
  }

  if (!walletIsUnlockedOrSyncing(walletStatus)) {
    return <WalletUnlockOrNearZeroLoading />
  }

  return (
    <div className="space-y-6">
      <PageHeader title={walletDashboardTitle(networkMode)} icon={Home} />

      <ImportInitialSyncErrorBanner />
      <OnchainSaveErrorBanner />

      <BalanceCard />
      <RecentTransactions />
    </div>
  )
}
