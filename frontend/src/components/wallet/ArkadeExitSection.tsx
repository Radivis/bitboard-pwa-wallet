import { Link } from '@tanstack/react-router'
import { ArkadeCollaborativeExitInfomodeContent } from '@/components/arkade/infomode/ArkadeCollaborativeExitInfomodeContent'
import { ArkadeExitInfomodeContent } from '@/components/arkade/infomode/ArkadeExitInfomodeContent'
import { ArkadeUnilateralExitInfomodeContent } from '@/components/arkade/infomode/ArkadeUnilateralExitInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { CollaborativeExitDialog } from '@/components/wallet/arkade-exit/CollaborativeExitDialog'
import { CompleteUnilateralExitDialog } from '@/components/wallet/arkade-exit/CompleteUnilateralExitDialog'
import { useArkadeAutonomousModeActive, useHasPendingBatchIntentKind } from '@/hooks/useArkadeQueries'
import { useArkadeExitFlow } from '@/hooks/useArkadeExitFlow'
import { isSignerRotationCooperativeExitBlocked } from '@/lib/arkade/arkade-cooperative-exit'
import { useWalletStore } from '@/stores/walletStore'

export function ArkadeExitSection() {
  const exitFlow = useArkadeExitFlow()
  const { setCollaborativeOpen, setCompleteUnilateralOpen, hasUnilateralExitInProgress } =
    exitFlow
  const signerMigrationHint = useWalletStore((state) => state.arkadeSignerMigrationHint)
  const collaborativeExitBlockedByRotation =
    isSignerRotationCooperativeExitBlocked(signerMigrationHint)
  const autonomousModeActive = useArkadeAutonomousModeActive()
  const hasPendingCollaborativeIntent = useHasPendingBatchIntentKind('collaborative_exit')

  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm font-medium">
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.exitSection}
          infoComponent={ArkadeExitInfomodeContent}
          as="span"
        >
          Exit to on-chain
        </InfomodeWrapper>
      </p>
      <p className="text-xs text-muted-foreground">
        Move Arkade funds back to a normal Bitcoin address.{' '}
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.learnAboutExits}
          infoComponent={ArkadeExitInfomodeContent}
          as="span"
        >
          <Link
            to="/library/articles/$slug"
            params={{ slug: 'arkade-vtxo-expiry' }}
            className="text-primary underline-offset-4 hover:underline"
          >
            Learn about exits
          </Link>
        </InfomodeWrapper>
      </p>
      <div className="flex flex-wrap gap-2">
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.collaborativeExit}
          infoComponent={ArkadeCollaborativeExitInfomodeContent}
          as="span"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              collaborativeExitBlockedByRotation ||
              autonomousModeActive ||
              hasPendingCollaborativeIntent
            }
            onClick={() => setCollaborativeOpen(true)}
          >
            Collaborative exit
          </Button>
        </InfomodeWrapper>
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.unilateralExit}
          infoComponent={ArkadeUnilateralExitInfomodeContent}
          as="span"
        >
          <Button type="button" variant="outline" size="sm" asChild>
            <Link
              to="/wallet/arkade/unilateral-exit"
              data-testid="arkade-unilateral-exit-control"
            >
              {hasUnilateralExitInProgress
                ? 'Control unilateral exit'
                : 'Start unilateral exit'}
            </Link>
          </Button>
        </InfomodeWrapper>
        {hasUnilateralExitInProgress && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="arkade-complete-unilateral-exit"
            onClick={() => setCompleteUnilateralOpen(true)}
          >
            Complete unilateral exit
          </Button>
        )}
      </div>
      {(collaborativeExitBlockedByRotation ||
        autonomousModeActive ||
        hasPendingCollaborativeIntent) && (
        <p className="text-xs text-muted-foreground" data-testid="arkade-exit-collab-unavailable">
          {hasPendingCollaborativeIntent
            ? 'Collaborative exit is unavailable while a batch intent is waiting for the operator.'
            : autonomousModeActive
            ? 'Collaborative exit is unavailable in autonomous mode. Use unilateral exit.'
            : 'Cooperative exit is unavailable after signer rotation cutoff. Use unilateral exit.'}
        </p>
      )}

      <CollaborativeExitDialog exitFlow={exitFlow} />
      <CompleteUnilateralExitDialog exitFlow={exitFlow} />
    </div>
  )
}
