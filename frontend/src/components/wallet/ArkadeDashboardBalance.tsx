import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { ArkadeSessionLoadError } from '@/components/arkade/ArkadeSessionLoadError'
import { ArkadeSessionLoading } from '@/components/arkade/ArkadeSessionLoading'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { ArkadeOverviewInfomodeContent } from '@/components/arkade/infomode/ArkadeOverviewInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { DesignBanner } from '@/components/design/DesignBanner'
import { ArkadeBalanceBreakdown } from '@/components/wallet/ArkadeBalanceBreakdown'
import { ArkadePendingBatchIntentBanner } from '@/components/wallet/ArkadePendingBatchIntentBanner'
import { ArkadeSignerMigrationBanner } from '@/components/wallet/ArkadeSignerMigrationBanner'
import { ArkadePendingRecoveryDueToExpiredSignerBanner } from '@/components/wallet/ArkadePendingRecoveryDueToExpiredSignerBanner'
import { ArkadeRecoverableVtxoBanner } from '@/components/wallet/ArkadeRecoverableVtxoBanner'
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
    <DesignCard
      elevation={2}
      data-testid="dashboard-arkade-balance-card"
      data-rail-arkade-load={arkadeRail.loadPhase}
      data-rail-arkade-sync={arkadeRail.syncPhase}
    >
      <DesignCardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <DesignCardTitle className="flex items-center gap-2">
            <ArkadeIcon className="h-4 w-4" />
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.dashboardBalance}
              infoComponent={ArkadeOverviewInfomodeContent}
              as="span"
            >
              Arkade balance
            </InfomodeWrapper>
          </DesignCardTitle>
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
      </DesignCardHeader>
      <DesignCardContent className="space-y-2">
        <ArkadePendingBatchIntentBanner />
        <ArkadeSignerMigrationBanner />
        <ArkadePendingRecoveryDueToExpiredSignerBanner />
        <ArkadeRecoverableVtxoBanner />
        {arkadeLoadSnapshot.loadPhase === 'load-error' ? (
          <ArkadeSessionLoadError embedded errorMessage={arkadeLoadSnapshot.errorMessage} />
        ) : arkadeLoadSnapshot.loadPhase === 'loading' && balance == null ? (
          <ArkadeSessionLoading embedded />
        ) : isLoading ? (
          <div className="design-type-regular flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </div>
        ) : balanceQuery.isError && balance == null ? (
          <p className="design-type-regular text-destructive" data-testid="dashboard-arkade-balance-error">
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
              <DesignBanner
                role="status"
                status="warning"
                data-testid="arkade-operator-stale-banner"
                title={
                  <InfomodeWrapper
                    infoId={ARKADE_INFOMODE_IDS.operatorStale}
                    infoTitle={ARKADE_OPERATOR_STALE_INFOMODE.title}
                    infoText={ARKADE_OPERATOR_STALE_INFOMODE.text}
                    as="span"
                  >
                    Showing saved operator state
                  </InfomodeWrapper>
                }
                description={
                  <>
                    Showing Arkade data from your wallet&apos;s saved operator state. The operator
                    has not been verified this session.
                    {lastSuccessfulOperatorSyncAt != null && (
                      <>
                        {' '}
                        Last verified with operator:{' '}
                        {new Date(lastSuccessfulOperatorSyncAt).toLocaleString()}.
                      </>
                    )}
                  </>
                }
              />
            ) : null}
          </>
        ) : null}
        <Link
          to="/wallet/management"
          className="design-type-regular text-primary underline-offset-4 hover:underline"
        >
          Arkade in Management
        </Link>
      </DesignCardContent>
    </DesignCard>
  )
}
