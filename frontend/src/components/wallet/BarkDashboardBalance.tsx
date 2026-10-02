import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { FiatBtcAmountDisplay } from '@/components/FiatBtcAmountDisplay'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RailLoadErrorBanner } from '@/components/wallet/RailLoadErrorBanner'
import { RailSyncControl } from '@/components/wallet/RailSyncControl'
import { RailSyncErrorBanner } from '@/components/wallet/RailSyncErrorBanner'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import { useBarkManualSyncMutation } from '@/hooks/useRailManualSyncMutations'
import { orchestrateBarkLoad } from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

export function BarkDashboardBalance() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  const barkManualSync = useBarkManualSyncMutation()
  const defaultFiatCurrency = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.defaultFiatCurrency,
  )

  const show = isBarkEnabled && isBarkNetworkMode(networkMode)
  if (!show) return null

  const spendableSats = syncSnapshot.spendableSats
  const isSyncing = syncSnapshot.syncPhase === 'syncing' || barkManualSync.isPending
  const showEstablishingSession =
    loadSnapshot.loadPhase === 'loading' && spendableSats == null
  const showSyncPlaceholder =
    loadSnapshot.loadPhase === 'loaded' && isSyncing && spendableSats == null

  return (
    <Card
      data-testid="dashboard-bark-balance-card"
      data-rail-bark-load={loadSnapshot.loadPhase}
      data-rail-bark-sync={syncSnapshot.syncPhase}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base">Bark balance</CardTitle>
          <RailSyncControl
            rail="bark"
            syncLabel="Sync Bark"
            syncPhase={syncSnapshot.syncPhase}
            lastSyncedAt={syncSnapshot.lastSuccessfulSyncAt}
            onSync={() => barkManualSync.mutate()}
            isSyncPending={barkManualSync.isPending}
            railConfigured={loadSnapshot.loadPhase === 'loaded'}
            syncErrorMessage={syncSnapshot.errorMessage}
            syncErrorDetailInBanner={loadSnapshot.loadPhase === 'loaded'}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loadSnapshot.loadPhase === 'load-error' ? (
          <RailLoadErrorBanner
            rail="bark"
            loadPhase={loadSnapshot.loadPhase}
            errorMessage={loadSnapshot.errorMessage}
            onRetry={() => {
              if (activeWalletId == null) return
              void orchestrateBarkLoad({
                walletId: activeWalletId,
                networkMode,
                allowRetryFromError: true,
              }).catch(() => {
                // The load snapshot already records the error.
              })
            }}
          />
        ) : null}
        {showEstablishingSession ? (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="dashboard-bark-session-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Establishing Bark session…
          </div>
        ) : null}
        {showSyncPlaceholder ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </div>
        ) : null}
        <RailSyncErrorBanner
          rail="bark"
          syncPhase={syncSnapshot.syncPhase}
          loadPhase={loadSnapshot.loadPhase}
          errorMessage={syncSnapshot.errorMessage}
          onRetry={() => barkManualSync.mutate()}
          isRetrying={isSyncing}
        />
        {spendableSats != null ? (
          <FiatBtcAmountDisplay
            amountSats={spendableSats}
            showFiatLayout={false}
            btcPriceInFiat={null}
            currency={defaultFiatCurrency}
            data-testid="dashboard-bark-balance-amount"
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/wallet/bark/board" data-testid="dashboard-bark-board-link">
              Board from on-chain
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/wallet/bark/exit" data-testid="dashboard-bark-exit-link">
              Exit to on-chain
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
