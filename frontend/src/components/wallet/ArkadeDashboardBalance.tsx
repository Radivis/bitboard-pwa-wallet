import { Link } from '@tanstack/react-router'
import { Layers, Loader2 } from 'lucide-react'
import { ArkadeOverviewInfomodeContent } from '@/components/arkade/infomode/ArkadeOverviewInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArkadeBalanceBreakdown } from '@/components/wallet/ArkadeBalanceBreakdown'
import { RailSyncControl } from '@/components/wallet/RailSyncControl'
import {
  ARKADE_INFOMODE_IDS,
  ARKADE_OPERATOR_STALE_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import { useArkadeSyncMetadataQuery } from '@/hooks/useArkadeDashboardQueries'
import {
  useArkadeRailSnapshot,
  useArkadeSyncLifecycleSnapshot,
} from '@/hooks/useArkadeLifecycleSnapshots'
import { useArkadeManualSyncMutation } from '@/hooks/useRailManualSyncMutations'
import { useArkadeBalanceQuery } from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

export function ArkadeDashboardBalance() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const storeBalance = useWalletStore((walletState) => walletState.arkadeBalance)
  const show = isArkadeActiveForNetworkMode(networkMode)
  const balanceQuery = useArkadeBalanceQuery()
  const arkadeSyncQuery = useArkadeSyncMetadataQuery()
  const arkadeRail = useArkadeRailSnapshot()
  const arkadeSyncSnapshot = useArkadeSyncLifecycleSnapshot()
  const arkadeManualSync = useArkadeManualSyncMutation()

  const balance = storeBalance ?? balanceQuery.data
  const isLoading = balanceQuery.isLoading && balance == null
  const isStaleArkade = arkadeSyncQuery.data?.isStaleArkade ?? false
  const lastSuccessfulOperatorSyncAt =
    arkadeSyncQuery.data?.lastSuccessfulOperatorSyncAt

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
            <Layers className="h-4 w-4" aria-hidden />
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
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
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
        ) : (
          <p
            className="text-sm text-muted-foreground"
            data-testid="dashboard-arkade-session-empty"
          >
            No Arkade session yet
          </p>
        )}
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
