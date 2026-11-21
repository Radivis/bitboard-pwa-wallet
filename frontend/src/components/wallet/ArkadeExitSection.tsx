import { Link } from '@tanstack/react-router'
import { ArkadeUnilateralExitInfomodeContent } from '@/components/arkade/infomode/ArkadeUnilateralExitInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignButton } from '@/components/design/DesignButton'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { useHasUnilateralExitInProgress } from '@/hooks/useHasUnilateralExitInProgress'

export function ArkadeExitSection() {
  const { hasUnilateralExitInProgress } = useHasUnilateralExitInProgress()

  return (
    <>
      <InfomodeWrapper
        infoId={ARKADE_INFOMODE_IDS.unilateralExit}
        infoComponent={ArkadeUnilateralExitInfomodeContent}
        as="span"
      >
        <DesignButton
          type="button"
          appearance={hasUnilateralExitInProgress ? 'primary' : 'tertiary'}
          asChild
        >
          <Link
            to="/wallet/arkade/unilateral-exit"
            data-testid="arkade-unilateral-exit-control"
          >
            {hasUnilateralExitInProgress
              ? 'Control unilateral exit'
              : 'Start unilateral exit'}
          </Link>
        </DesignButton>
      </InfomodeWrapper>
      {hasUnilateralExitInProgress && (
        <DesignButton type="button" appearance="secondary" asChild>
          <Link
            to="/wallet/arkade/complete-unilateral-exit"
            data-testid="arkade-complete-unilateral-exit"
          >
            Complete unilateral exit
          </Link>
        </DesignButton>
      )}
    </>
  )
}
