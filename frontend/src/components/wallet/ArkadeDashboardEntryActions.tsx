import { Link } from '@tanstack/react-router'
import { ArkadeBoardingInfomodeContent } from '@/components/arkade/infomode/ArkadeBoardingInfomodeContent'
import { ArkadeCollaborativeExitInfomodeContent } from '@/components/arkade/infomode/ArkadeCollaborativeExitInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignButton } from '@/components/design/DesignButton'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import {
  useArkadeAutonomousModeActive,
  useHasPendingBatchIntentKind,
} from '@/hooks/useArkadeQueries'
import { isSignerRotationCooperativeExitBlocked } from '@/lib/arkade/arkade-cooperative-exit'
import { useWalletStore } from '@/stores/walletStore'
import { ArkadeRenewVtxosButton } from '@/components/wallet/ArkadeRenewVtxosButton'
import { DashboardAdvancedActionsLink } from '@/components/wallet/DashboardAdvancedActionsLink'

function collaborativeExitUnavailableReason(params: {
  hasPendingCollaborativeIntent: boolean
  autonomousModeActive: boolean
}): string {
  if (params.hasPendingCollaborativeIntent) {
    return 'Collaborative exit is unavailable while a batch intent is waiting for the operator.'
  }
  if (params.autonomousModeActive) {
    return 'Collaborative exit is unavailable in autonomous mode. Use unilateral exit or disable autonomous mode.'
  }
  return 'Cooperative exit is unavailable after signer rotation cutoff. Migrate to a new signer or use unilateral exit.'
}

function useCollaborativeExitAvailability() {
  const signerMigrationHint = useWalletStore((state) => state.arkadeSignerMigrationHint)
  const collaborativeExitBlockedByRotation =
    isSignerRotationCooperativeExitBlocked(signerMigrationHint)
  const autonomousModeActive = useArkadeAutonomousModeActive()
  const hasPendingCollaborativeIntent = useHasPendingBatchIntentKind('collaborative_exit')
  const unavailable =
    collaborativeExitBlockedByRotation || autonomousModeActive || hasPendingCollaborativeIntent

  return {
    unavailable,
    reason: unavailable
      ? collaborativeExitUnavailableReason({
          hasPendingCollaborativeIntent,
          autonomousModeActive,
        })
      : null,
  }
}

function ArkadeBoardFromOnchainButton() {
  const autonomousModeActive = useArkadeAutonomousModeActive()

  return (
    <InfomodeWrapper
      infoId={ARKADE_INFOMODE_IDS.boardFromOnchain}
      infoComponent={ArkadeBoardingInfomodeContent}
      as="span"
    >
      {autonomousModeActive ? (
        <DesignButton
          type="button"
          appearance="secondary"
          disabled
          data-testid="dashboard-arkade-board-link"
        >
          Board from on-chain
        </DesignButton>
      ) : (
        <DesignButton type="button" appearance="secondary" asChild>
          <Link
            to="/wallet/arkade/board"
            data-testid="dashboard-arkade-board-link"
          >
            Board from on-chain
          </Link>
        </DesignButton>
      )}
    </InfomodeWrapper>
  )
}

function ArkadeCollaborativeExitButton({ unavailable }: { unavailable: boolean }) {
  return (
    <InfomodeWrapper
      infoId={ARKADE_INFOMODE_IDS.collaborativeExit}
      infoComponent={ArkadeCollaborativeExitInfomodeContent}
      as="span"
    >
      {unavailable ? (
        <DesignButton
          type="button"
          appearance="secondary"
          disabled
          data-testid="dashboard-arkade-collaborative-exit-link"
        >
          Collaborative exit
        </DesignButton>
      ) : (
        <DesignButton type="button" appearance="secondary" asChild>
          <Link
            to="/wallet/arkade/collaborative-exit"
            data-testid="dashboard-arkade-collaborative-exit-link"
          >
            Collaborative exit
          </Link>
        </DesignButton>
      )}
    </InfomodeWrapper>
  )
}

export function ArkadeDashboardEntryActions() {
  const collaborativeExit = useCollaborativeExitAvailability()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <ArkadeRenewVtxosButton />
        <ArkadeBoardFromOnchainButton />
        <ArkadeCollaborativeExitButton unavailable={collaborativeExit.unavailable} />
        <DashboardAdvancedActionsLink section="arkade" />
      </div>
      {collaborativeExit.reason != null && (
        <p
          className="design-type-regular text-muted-foreground"
          data-testid="arkade-exit-collab-unavailable"
        >
          {collaborativeExit.reason}
        </p>
      )}
    </div>
  )
}
