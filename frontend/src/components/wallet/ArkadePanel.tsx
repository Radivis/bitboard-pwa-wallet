import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { ArkadeBoardingInfomodeContent } from '@/components/arkade/infomode/ArkadeBoardingInfomodeContent'
import { ArkadeOverviewInfomodeContent } from '@/components/arkade/infomode/ArkadeOverviewInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ARKADE_DELEGATOR_FEE_INFOMODE,
  ARKADE_INFOMODE_IDS,
  ARKADE_RENEW_VTXOS_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import { ArkadeAutonomousModeSwitch } from '@/components/wallet/ArkadeAutonomousModeSwitch'
import { ArkadeOperatorTrustGate } from '@/components/wallet/ArkadeOperatorTrustGate'
import { ArkadeBalanceBreakdown } from '@/components/wallet/ArkadeBalanceBreakdown'
import { ArkadeSignerMigrationBanner } from '@/components/wallet/ArkadeSignerMigrationBanner'
import { ArkadePendingRecoveryDueToExpiredSignerBanner } from '@/components/wallet/ArkadePendingRecoveryDueToExpiredSignerBanner'
import { ArkadeRecoverableVtxoBanner } from '@/components/wallet/ArkadeRecoverableVtxoBanner'
import { RailSyncWarningBanner } from '@/components/wallet/RailSyncWarningBanner'
import {
  useArkadeAddressQuery,
  useArkadeAutonomousModeActive,
  useArkadeBalanceQuery,
  useArkadeDelegateInfoQuery,
  useArkadeRenewMutation,
} from '@/hooks/useArkadeQueries'
import {
  useArkadeLoadLifecycleSnapshot,
  useArkadeRailSnapshot,
  useArkadeSyncLifecycleSnapshot,
} from '@/hooks/useArkadeLifecycleSnapshots'
import { useArkadeManualSyncMutation } from '@/hooks/useRailManualSyncMutations'
import {
  getArkadeDelegatorDisplayLabel,
  isArkadeDelegatorConfigured,
  isArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { ArkadeExitSection } from '@/components/wallet/ArkadeExitSection'
import { ArkadeVtxoExpiryIndicator } from '@/components/wallet/ArkadeVtxoExpiryIndicator'

export function ArkadePanel() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const storeReceiveAddress = useWalletStore((s) => s.arkadeReceiveAddress)
  const show = isArkadeActiveForNetworkMode(networkMode)
  const delegatorConfigured =
    isArkadeSupportedNetworkMode(networkMode) &&
    isArkadeDelegatorConfigured(networkMode)

  const balanceQuery = useArkadeBalanceQuery()
  const delegateQuery = useArkadeDelegateInfoQuery()
  const renewMutation = useArkadeRenewMutation()
  const addressQuery = useArkadeAddressQuery()
  const arkadeRail = useArkadeRailSnapshot()
  const arkadeLoadSnapshot = useArkadeLoadLifecycleSnapshot()
  const arkadeSyncSnapshot = useArkadeSyncLifecycleSnapshot()
  const arkadeManualSync = useArkadeManualSyncMutation()
  const autonomousModeActive = useArkadeAutonomousModeActive()

  if (!show) return null

  const balance = balanceQuery.data
  const delegateFee =
    delegateQuery.data?.fee != null ? Number(delegateQuery.data.fee) : null
  const delegatorLabel =
    isArkadeSupportedNetworkMode(networkMode)
      ? getArkadeDelegatorDisplayLabel(networkMode)
      : 'configured delegator'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArkadeIcon className="h-5 w-5" />
          <InfomodeWrapper
            infoId={ARKADE_INFOMODE_IDS.managementPanel}
            infoComponent={ArkadeOverviewInfomodeContent}
            as="span"
          >
            Arkade (offchain layer)
          </InfomodeWrapper>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ArkadeOperatorTrustGate />
        <ArkadeAutonomousModeSwitch />
        <ArkadeSignerMigrationBanner />
        <ArkadePendingRecoveryDueToExpiredSignerBanner />
        <ArkadeRecoverableVtxoBanner />
        <RailSyncWarningBanner
          rail="arkade"
          syncPhase={arkadeSyncSnapshot.syncPhase}
          loadPhase={arkadeLoadSnapshot.loadPhase}
          warningMessage={arkadeSyncSnapshot.warningMessage}
          onRetry={() => {
            if (!autonomousModeActive) {
              arkadeManualSync.mutate()
            }
          }}
          isRetrying={
            !autonomousModeActive &&
            (arkadeRail.syncPhase === 'syncing' || arkadeManualSync.isPending)
          }
        />
        <p className="text-sm text-muted-foreground">
          Instant payments on Arkade use separate addresses from your on-chain{' '}
          <code className="text-xs">bc1</code> receive address.
          {delegatorConfigured
            ? ' Renewal is handled by the delegator while this app is closed.'
            : ' Use “Renew VTXOs now” while the app is open, or enable a delegator via deployment config.'}
        </p>

        {balanceQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading Arkade balance…
          </div>
        ) : balance ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Balance</p>
            <ArkadeBalanceBreakdown balance={balance} />
            <ArkadeVtxoExpiryIndicator />
          </div>
        ) : null}

        {(storeReceiveAddress ?? addressQuery.data) && (
          <div className="break-all rounded-md border bg-muted/40 p-2 font-mono text-xs">
            {storeReceiveAddress ?? addressQuery.data}
          </div>
        )}

        {delegateFee != null && (
          <InfomodeWrapper
            infoId={ARKADE_INFOMODE_IDS.delegatorFee}
            infoTitle={ARKADE_DELEGATOR_FEE_INFOMODE.title}
            infoText={ARKADE_DELEGATOR_FEE_INFOMODE.text}
            as="span"
          >
            <p className="text-xs text-muted-foreground">
              Delegator service fee: {delegateFee} sats per renewal ({delegatorLabel})
            </p>
          </InfomodeWrapper>
        )}

        <ArkadeExitSection />

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/wallet/arkade/vtxos">View VTXOs</Link>
          </Button>
          <InfomodeWrapper
            infoId={ARKADE_INFOMODE_IDS.boardFromOnchain}
            infoComponent={ArkadeBoardingInfomodeContent}
            as="span"
          >
            {autonomousModeActive ? (
              <Button type="button" variant="outline" size="sm" disabled>
                Board from on-chain
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/wallet/arkade/board">Board from on-chain</Link>
              </Button>
            )}
          </InfomodeWrapper>
          <InfomodeWrapper
            infoId={ARKADE_INFOMODE_IDS.renewVtxos}
            infoTitle={ARKADE_RENEW_VTXOS_INFOMODE.title}
            infoText={ARKADE_RENEW_VTXOS_INFOMODE.text}
            as="span"
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={autonomousModeActive || renewMutation.isPending}
              onClick={() => renewMutation.mutate()}
            >
              Renew VTXOs now
            </Button>
          </InfomodeWrapper>
        </div>
      </CardContent>
    </Card>
  )
}
