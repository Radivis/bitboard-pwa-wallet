import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { ArkadeOverviewInfomodeContent } from '@/components/arkade/infomode/ArkadeOverviewInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArkadeBalanceBreakdown } from '@/components/wallet/ArkadeBalanceBreakdown'
import { ArkadeSignerMigrationBanner } from '@/components/wallet/ArkadeSignerMigrationBanner'
import { ArkadePendingRecoveryDueToExpiredSignerBanner } from '@/components/wallet/ArkadePendingRecoveryDueToExpiredSignerBanner'
import { ArkadeRecoverableVtxoBanner } from '@/components/wallet/ArkadeRecoverableVtxoBanner'
import { RailLoadErrorBanner } from '@/components/wallet/RailLoadErrorBanner'
import { RailSyncControl } from '@/components/wallet/RailSyncControl'
import { RailSyncErrorBanner } from '@/components/wallet/RailSyncErrorBanner'
import { RailSyncWarningBanner } from '@/components/wallet/RailSyncWarningBanner'
import {
  ARKADE_INFOMODE_IDS,
  ARKADE_OPERATOR_STALE_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import { useArkadeSyncMetadataQuery } from '@/hooks/useArkadeDashboardQueries'
import {
  useArkadeRailSnapshot,
  useArkadeLoadLifecycleSnapshot,
  useArkadeSyncLifecycleSnapshot,
} from '@/hooks/useArkadeLifecycleSnapshots'
import { useArkadeManualSyncMutation } from '@/hooks/useRailManualSyncMutations'
import { useArkadeBalanceQuery } from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { orchestrateArkadeRetryLoad } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

export function ArkadeDashboardBalance() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const storeBalance = useWalletStore((walletState) => walletState.arkadeBalance)
  const lastOperatorSyncTime = useWalletStore(
    (walletState) => walletState.lastOperatorSyncTime,
  )
  const show = isArkadeActiveForNetworkMode(networkMode)
  const balanceQuery = useArkadeBalanceQuery()
  const arkadeSyncQuery = useArkadeSyncMetadataQuery()
  const arkadeRail = useArkadeRailSnapshot()
  const arkadeLoadSnapshot = useArkadeLoadLifecycleSnapshot()
  const arkadeSyncSnapshot = useArkadeSyncLifecycleSnapshot()
  const arkadeManualSync = useArkadeManualSyncMutation()

  const balance = storeBalance ?? balanceQuery.data
  const isLoading = balanceQuery.isLoading && balance == null
  const isStaleArkade =
    (arkadeSyncQuery.data?.isStaleArkade ?? false) && arkadeRail.syncPhase !== 'sync-error'
  const lastSuccessfulOperatorSyncAt =
    arkadeSyncQuery.data?.lastSuccessfulOperatorSyncAt ?? lastOperatorSyncTime ?? undefined

  if (!show) return null

  return (
    <Card
      data-testid="dashboard-arkade-balance-card"
      data-rail-arkade-load={arkadeRail.loadPhase}
      data-rail-arkade-sync={arkadeRail.syncPhase}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ArkadeIcon className="h-4 w-4" />
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.dashboardBalance}
              infoComponent={ArkadeOverviewInfomodeContent}
              as="span"
            >
              Arkade balance
            </InfomodeWrapper>
          </CardTitle>
          <RailSyncControl
            rail="arkade"
            syncLabel="Sync Arkade"
            syncPhase={arkadeSyncSnapshot.syncPhase}
            lastSyncedAt={lastSuccessfulOperatorSyncAt ?? null}
            onSync={() => arkadeManualSync.mutate()}
            isSyncPending={arkadeManualSync.isPending}
            railConfigured={arkadeRail.loadPhase !== 'not-configured'}
            syncErrorMessage={arkadeSyncSnapshot.errorMessage}
            syncErrorDetailInBanner={arkadeLoadSnapshot.loadPhase === 'loaded'}
            syncWarningMessage={arkadeSyncSnapshot.warningMessage}
            syncWarningDetailInBanner={arkadeLoadSnapshot.loadPhase === 'loaded'}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <ArkadeSignerMigrationBanner />
        <ArkadePendingRecoveryDueToExpiredSignerBanner />
        <ArkadeRecoverableVtxoBanner />
        {arkadeLoadSnapshot.loadPhase === 'load-error' ? (
          <RailLoadErrorBanner
            rail="arkade"
            loadPhase={arkadeLoadSnapshot.loadPhase}
            errorMessage={arkadeLoadSnapshot.errorMessage}
            onRetry={() => {
              void orchestrateArkadeRetryLoad()
            }}
          />
        ) : arkadeLoadSnapshot.loadPhase === 'loading' && balance == null ? (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="dashboard-arkade-session-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Establishing Arkade session…
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </div>
        ) : balanceQuery.isError && balance == null ? (
          <p className="text-sm text-destructive" data-testid="dashboard-arkade-balance-error">
            Could not load Arkade balance. Check your network and try again.
          </p>
        ) : balance ? (
          <>
            <RailSyncWarningBanner
              rail="arkade"
              syncPhase={arkadeSyncSnapshot.syncPhase}
              loadPhase={arkadeLoadSnapshot.loadPhase}
              warningMessage={arkadeSyncSnapshot.warningMessage}
              onRetry={() => arkadeManualSync.mutate()}
              isRetrying={
                arkadeRail.syncPhase === 'syncing' || arkadeManualSync.isPending
              }
            />
            <RailSyncErrorBanner
              rail="arkade"
              syncPhase={arkadeSyncSnapshot.syncPhase}
              loadPhase={arkadeLoadSnapshot.loadPhase}
              errorMessage={arkadeSyncSnapshot.errorMessage}
              onRetry={() => arkadeManualSync.mutate()}
              isRetrying={
                arkadeRail.syncPhase === 'syncing' || arkadeManualSync.isPending
              }
            />
            <ArkadeBalanceBreakdown
              balance={balance}
              amountTestId="dashboard-arkade-balance-amount"
            />
            {isStaleArkade ? (
              <InfomodeWrapper
                infoId={ARKADE_INFOMODE_IDS.operatorStale}
                infoTitle={ARKADE_OPERATOR_STALE_INFOMODE.title}
                infoText={ARKADE_OPERATOR_STALE_INFOMODE.text}
                as="span"
              >
                <p
                  className="text-xs text-amber-700 dark:text-amber-400"
                  data-testid="arkade-operator-stale-banner"
                >
                  Showing Arkade data from your wallet&apos;s saved operator state. The operator
                  has not been verified this session.
                  {lastSuccessfulOperatorSyncAt != null && (
                    <>
                      {' '}
                      Last verified with operator:{' '}
                      {new Date(lastSuccessfulOperatorSyncAt).toLocaleString()}.
                    </>
                  )}
                </p>
              </InfomodeWrapper>
            ) : null}
          </>
        ) : null}
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
