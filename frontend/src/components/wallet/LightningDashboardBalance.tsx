import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { FiatBtcAmountDisplay } from '@/components/FiatBtcAmountDisplay'
import { DesignBanner } from '@/components/design/DesignBanner'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { DashboardAdvancedActionsLink } from '@/components/wallet/DashboardAdvancedActionsLink'
import { RailLoadErrorBanner } from '@/components/wallet/RailLoadErrorBanner'
import { RailSyncControl } from '@/components/wallet/RailSyncControl'
import { RailSyncErrorBanner } from '@/components/wallet/RailSyncErrorBanner'
import { useLightningSyncMetadataQuery } from '@/hooks/useLightningDashboardQueries'
import {
  useLightningLoadLifecycleSnapshot,
  useLightningRailSnapshot,
  useLightningSyncLifecycleSnapshot,
} from '@/hooks/useLightningLifecycleSnapshots'
import { useLightningBalancesForDashboardQuery } from '@/hooks/useLightningMutations'
import { useLightningManualSyncMutation } from '@/hooks/useRailManualSyncMutations'
import { useMainnetFiatAmountProps } from '@/hooks/useMainnetFiatAmountProps'
import type { LightningBalanceRow } from '@/lib/lightning/lightning-dashboard-sync'
import { orchestrateLightningRetryLoad } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'
import {
  hasNetworkConnectedWallet,
  useLightningStore,
} from '@/stores/lightningStore'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore } from '@/stores/walletStore'

export function useIsLightningDashboardBalanceShown(): boolean {
  return useLightningDashboardBalanceModel().shown
}

function useLightningDashboardBalanceModel() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const connectedLightningWallets = useLightningStore(
    (lightningState) => lightningState.connectedWallets,
  )
  const lightningBalancesQuery = useLightningBalancesForDashboardQuery()
  const lightningRail = useLightningRailSnapshot()
  const lightningLoadSnapshot = useLightningLoadLifecycleSnapshot()
  const lightningSyncSnapshot = useLightningSyncLifecycleSnapshot()
  const lightningSyncMetadataQuery = useLightningSyncMetadataQuery()
  const lightningManualSync = useLightningManualSyncMutation()

  const showLightningBalances =
    isLightningEnabled &&
    networkMode !== 'lab' &&
    hasNetworkConnectedWallet(connectedLightningWallets, activeWalletId, networkMode)

  const isLightningBalancesSectionLoading =
    showLightningBalances &&
    lightningRail.loadPhase !== 'load-error' &&
    (lightningRail.loadPhase !== 'loaded' || lightningBalancesQuery.isLoading)

  const lightningBalanceRows = useMemo(
    () => lightningBalancesQuery.data?.lightningBalanceRows ?? [],
    [lightningBalancesQuery.data?.lightningBalanceRows],
  )
  const showLightningLoadError = lightningLoadSnapshot.loadPhase === 'load-error'
  const showLightningBalancesSection =
    showLightningLoadError ||
    (showLightningBalances &&
      lightningBalancesQuery.isSuccess &&
      lightningBalanceRows.length > 0)

  return {
    shown: isLightningBalancesSectionLoading || showLightningBalancesSection,
    isLightningBalancesSectionLoading,
    showLightningBalancesSection,
    showLightningLoadError,
    lightningTotalSats: lightningBalancesQuery.data?.totalSats ?? 0,
    lightningBalanceRows,
    lightningRail,
    lightningLoadSnapshot,
    lightningSyncSnapshot,
    lightningSyncMetadataQuery,
    lightningManualSync,
  }
}

export function LightningDashboardBalance() {
  const model = useLightningDashboardBalanceModel()
  const fiatAmount = useMainnetFiatAmountProps()
  const fiatAmountProps = {
    showFiatLayout: fiatAmount.showFiatLayout,
    btcPriceInFiat: fiatAmount.btcPriceInFiat,
    currency: fiatAmount.currency,
    rateLoading: fiatAmount.rateLoading,
  }

  if (!model.shown) return null

  const hasStaleLightningBalance = model.lightningBalanceRows.some(
    (balanceRow) => balanceRow.isStaleBalance,
  )
  const newestStaleBalanceIso = newestStaleLightningBalanceIso(model.lightningBalanceRows)
  const isSyncing =
    model.lightningRail.syncPhase === 'syncing' || model.lightningManualSync.isPending

  return (
    <DesignCard
      data-testid="dashboard-lightning-balance-card"
      data-rail-lightning-load={model.lightningRail.loadPhase}
      data-rail-lightning-sync={model.lightningRail.syncPhase}
    >
      <DesignCardHeader>
        <DesignCardTitle>
          Lightning balance
          <span className="design-type-metadata uppercase text-muted-foreground">NWC</span>
        </DesignCardTitle>
      </DesignCardHeader>
      <DesignCardContent className="space-y-2">
        {model.isLightningBalancesSectionLoading ? (
          <div className="design-type-regular flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Lightning balances…
          </div>
        ) : null}
        {model.showLightningBalancesSection ? (
          <>
            {model.showLightningLoadError ? (
              <RailLoadErrorBanner
                rail="lightning"
                loadPhase={model.lightningLoadSnapshot.loadPhase}
                errorMessage={model.lightningLoadSnapshot.errorMessage}
                onRetry={() => {
                  void orchestrateLightningRetryLoad()
                }}
              />
            ) : (
              <>
                {model.lightningBalanceRows.length === 1 ? (
                  <p className="design-type-emphasis text-foreground">
                    {model.lightningBalanceRows[0].label}
                  </p>
                ) : (
                  <p className="design-type-regular text-muted-foreground">
                    Total across {model.lightningBalanceRows.length} connected wallets
                  </p>
                )}
                <FiatBtcAmountDisplay
                  amountSats={model.lightningTotalSats}
                  {...fiatAmountProps}
                  amountTypography="largeBalances"
                />
                <ul className="design-type-regular space-y-1.5 border-t border-border pt-3">
                  {model.lightningBalanceRows.map((row) => (
                    <li key={row.connectionId} className="flex justify-between gap-2">
                      <span className="design-type-emphasis min-w-0 truncate text-foreground">
                        {row.label}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {row.error != null && !row.isStaleBalance ? (
                          <span className="text-amber-600 dark:text-amber-400">—</span>
                        ) : (
                          <>
                            <FiatBtcAmountDisplay
                              amountSats={row.balanceSats}
                              {...fiatAmountProps}
                              isDetail
                              amountTypography="smallBalances"
                              className="inline text-muted-foreground"
                            />
                            {row.isStaleBalance ? (
                              <span
                                className="design-type-regular ml-1 text-amber-700 dark:text-amber-400"
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
                {hasStaleLightningBalance ? (
                  <DesignBanner
                    role="status"
                    status="warning"
                    data-testid="lightning-balance-stale-banner"
                    title="Showing saved Lightning balance"
                    description={
                      <>
                        Showing last known Lightning balance saved in this app (not a live check).
                        NWC could not be reached.
                        {newestStaleBalanceIso != null ? (
                          <> Updated: {new Date(newestStaleBalanceIso).toLocaleString()}.</>
                        ) : null}
                      </>
                    }
                  />
                ) : null}
                {model.lightningBalanceRows.some((balanceRow) => balanceRow.error != null) ? (
                  <p className="design-type-regular text-amber-700 dark:text-amber-400">
                    Some Lightning wallets could not be reached and have no saved balance yet;
                    those show “—” and are not included in the total.
                  </p>
                ) : null}
                <RailSyncErrorBanner
                  rail="lightning"
                  syncPhase={model.lightningSyncSnapshot.syncPhase}
                  loadPhase={model.lightningLoadSnapshot.loadPhase}
                  errorMessage={model.lightningSyncSnapshot.errorMessage}
                  onRetry={() => model.lightningManualSync.mutate()}
                  isRetrying={isSyncing}
                />
                <RailSyncControl
                  rail="lightning"
                  syncLabel="Sync Lightning"
                  syncPhase={model.lightningRail.syncPhase}
                  lastSyncedAt={model.lightningSyncMetadataQuery.data?.lastSyncedAt ?? null}
                  onSync={() => model.lightningManualSync.mutate()}
                  isSyncPending={model.lightningManualSync.isPending}
                  railConfigured={model.lightningRail.loadPhase !== 'not-configured'}
                  syncErrorMessage={model.lightningSyncSnapshot.errorMessage}
                  syncErrorDetailInBanner={model.lightningLoadSnapshot.loadPhase === 'loaded'}
                />
              </>
            )}
          </>
        ) : null}
        <DashboardAdvancedActionsLink section="lightning" />
      </DesignCardContent>
    </DesignCard>
  )
}

function newestStaleLightningBalanceIso(
  lightningBalanceRows: LightningBalanceRow[],
): string | null {
  const times = lightningBalanceRows
    .filter(
      (balanceRow) => balanceRow.isStaleBalance && balanceRow.balanceSnapshotAt != null,
    )
    .map((balanceRow) => balanceRow.balanceSnapshotAt as string)
  if (times.length === 0) return null
  return times.reduce((newerIso, olderIso) => (newerIso > olderIso ? newerIso : olderIso))
}
