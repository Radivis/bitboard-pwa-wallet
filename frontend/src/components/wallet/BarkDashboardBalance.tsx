import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { FiatBtcAmountDisplay } from '@/components/FiatBtcAmountDisplay'
import { BarkSessionLoadError } from '@/components/bark/BarkSessionLoadError'
import { BarkSessionLoading } from '@/components/bark/BarkSessionLoading'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarkPendingActionBanner } from '@/components/wallet/BarkPendingActionBanner'
import { RailSyncControl } from '@/components/wallet/RailSyncControl'
import { RailSyncErrorBanner } from '@/components/wallet/RailSyncErrorBanner'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import { useBarkManualSyncMutation } from '@/hooks/useRailManualSyncMutations'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import {
  barkRefreshNoticeText,
  barkRefreshWarningText,
  type BarkRefreshStatus,
} from '@/lib/bark/bark-refresh-status'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

export function BarkDashboardBalance() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  const barkManualSync = useBarkManualSyncMutation()
  const defaultFiatCurrency = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.defaultFiatCurrency,
  )

  const show = isBarkEnabled && isBarkNetworkMode(networkMode)
  if (!show || loadSnapshot.loadPhase === 'not-configured') return null

  const spendableSats = syncSnapshot.spendableSats
  const lockedSats = syncSnapshot.lockedSats ?? 0
  const totalSats = spendableSats == null ? null : spendableSats + lockedSats
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
          <BarkSessionLoadError embedded errorMessage={loadSnapshot.errorMessage} />
        ) : null}
        {showEstablishingSession ? <BarkSessionLoading embedded /> : null}
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
        {totalSats != null && spendableSats != null ? (
          <FiatBtcAmountDisplay
            amountSats={totalSats}
            showFiatLayout={false}
            btcPriceInFiat={null}
            currency={defaultFiatCurrency}
            data-testid="dashboard-bark-balance-amount"
          />
        ) : null}
        {spendableSats != null && lockedSats > 0 ? (
          <div
            className="space-y-1 text-sm text-muted-foreground"
            data-testid="dashboard-bark-balance-subbalances"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span>Spendable</span>
              <FiatBtcAmountDisplay
                amountSats={spendableSats}
                showFiatLayout={false}
                btcPriceInFiat={null}
                currency={defaultFiatCurrency}
                data-testid="dashboard-bark-balance-spendable"
              />
            </div>
            <div className="flex flex-wrap items-baseline gap-2">
              <span>Locked</span>
              <FiatBtcAmountDisplay
                amountSats={lockedSats}
                showFiatLayout={false}
                btcPriceInFiat={null}
                currency={defaultFiatCurrency}
                data-testid="dashboard-bark-balance-locked"
              />
            </div>
          </div>
        ) : null}
        <BarkPendingActionBanner />
        <BarkRefreshStatusLine status={syncSnapshot.refreshStatus} />
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

function BarkRefreshStatusLine({ status }: { status: BarkRefreshStatus | undefined }) {
  const notice = status == null ? null : barkRefreshNoticeText(status)
  if (notice != null) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="dashboard-bark-refresh-notice">
        {notice}
      </p>
    )
  }
  const warning = status == null ? null : barkRefreshWarningText(status)
  if (warning == null) return null
  return (
    <p className="text-sm text-destructive" data-testid="dashboard-bark-refresh-warning">
      {warning}
    </p>
  )
}
