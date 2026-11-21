import { Link } from '@tanstack/react-router'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { ArkadeSessionGate } from '@/components/arkade/ArkadeSessionGate'
import { ArkadeOverviewInfomodeContent } from '@/components/arkade/infomode/ArkadeOverviewInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { DesignButton } from '@/components/design/DesignButton'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { ArkadeAutonomousModeSwitch } from '@/components/wallet/ArkadeAutonomousModeSwitch'
import { ArkadeOperatorTrustGate } from '@/components/wallet/ArkadeOperatorTrustGate'
import { ArkadePendingBatchIntentBanner } from '@/components/wallet/ArkadePendingBatchIntentBanner'
import { ArkadeSignerMigrationBanner } from '@/components/wallet/ArkadeSignerMigrationBanner'
import { ArkadePendingRecoveryDueToExpiredSignerBanner } from '@/components/wallet/ArkadePendingRecoveryDueToExpiredSignerBanner'
import { ArkadeRecoverableVtxoBanner } from '@/components/wallet/ArkadeRecoverableVtxoBanner'
import { RailSyncWarningBanner } from '@/components/wallet/RailSyncWarningBanner'
import { useArkadeAutonomousModeActive } from '@/hooks/useArkadeQueries'
import {
  useArkadeLoadLifecycleSnapshot,
  useArkadeRailSnapshot,
  useArkadeSyncLifecycleSnapshot,
} from '@/hooks/useArkadeLifecycleSnapshots'
import { useArkadeManualSyncMutation } from '@/hooks/useRailManualSyncMutations'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { ArkadeExitSection } from '@/components/wallet/ArkadeExitSection'
import { ArkadeRenewVtxosButton } from '@/components/wallet/ArkadeRenewVtxosButton'
import { ArkadeVtxoExpiryIndicator } from '@/components/wallet/ArkadeVtxoExpiryIndicator'

export function ArkadePanel() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const show = isArkadeActiveForNetworkMode(networkMode)

  const arkadeRail = useArkadeRailSnapshot()
  const arkadeLoadSnapshot = useArkadeLoadLifecycleSnapshot()
  const arkadeSyncSnapshot = useArkadeSyncLifecycleSnapshot()
  const arkadeManualSync = useArkadeManualSyncMutation()
  const autonomousModeActive = useArkadeAutonomousModeActive()

  if (!show) return null

  return (
    <DesignCard>
      <DesignCardHeader>
        <DesignCardTitle className="flex items-center gap-2">
          <ArkadeIcon className="h-5 w-5" />
          <InfomodeWrapper
            infoId={ARKADE_INFOMODE_IDS.managementPanel}
            infoComponent={ArkadeOverviewInfomodeContent}
            as="span"
          >
            Arkade
          </InfomodeWrapper>
        </DesignCardTitle>
      </DesignCardHeader>
      <DesignCardContent className="space-y-4">
        <ArkadeOperatorTrustGate />
        <ArkadePendingBatchIntentBanner />
        <ArkadeSignerMigrationBanner />
        <ArkadePendingRecoveryDueToExpiredSignerBanner />
        <ArkadeRecoverableVtxoBanner />
        <RailSyncWarningBanner
          rail="arkade"
          syncPhase={arkadeSyncSnapshot.syncPhase}
          loadPhase={arkadeLoadSnapshot.loadPhase}
          warningMessages={arkadeSyncSnapshot.warningMessages}
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
        <ArkadeSessionGate
          loadPhase={arkadeLoadSnapshot.loadPhase}
          errorMessage={arkadeLoadSnapshot.errorMessage}
          networkMode={arkadeLoadSnapshot.networkMode}
          embedded
        >
          <ArkadeVtxoExpiryIndicator />
        </ArkadeSessionGate>

        <div className="flex flex-wrap gap-2">
          <ArkadeRenewVtxosButton />
          <DesignButton type="button" appearance="secondary" asChild>
            <Link to="/wallet/arkade/vtxos">View VTXOs</Link>
          </DesignButton>
          <ArkadeExitSection />
        </div>
        <ArkadeAutonomousModeSwitch />
      </DesignCardContent>
    </DesignCard>
  )
}
