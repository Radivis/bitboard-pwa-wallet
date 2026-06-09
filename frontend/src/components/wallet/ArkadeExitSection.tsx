import { Link } from '@tanstack/react-router'
import { ArkadeCollaborativeExitInfomodeContent } from '@/components/arkade/infomode/ArkadeCollaborativeExitInfomodeContent'
import { ArkadeExitInfomodeContent } from '@/components/arkade/infomode/ArkadeExitInfomodeContent'
import { ArkadeUnilateralExitInfomodeContent } from '@/components/arkade/infomode/ArkadeUnilateralExitInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { CollaborativeExitDialog } from '@/components/wallet/arkade-exit/CollaborativeExitDialog'
import { UnilateralExitDialog } from '@/components/wallet/arkade-exit/UnilateralExitDialog'
import { useArkadeExitFlow } from '@/hooks/useArkadeExitFlow'

export function ArkadeExitSection() {
  const exitFlow = useArkadeExitFlow()
  const { setCollaborativeOpen, setUnilateralOpen } = exitFlow

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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setUnilateralOpen(true)}
          >
            Unilateral exit
          </Button>
        </InfomodeWrapper>
      </div>

      <CollaborativeExitDialog exitFlow={exitFlow} />
      <UnilateralExitDialog exitFlow={exitFlow} />
    </div>
  )
}
