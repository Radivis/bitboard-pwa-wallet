import { Loader2 } from 'lucide-react'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignButton } from '@/components/design/DesignButton'
import {
  ARKADE_INFOMODE_IDS,
  ARKADE_RENEW_VTXOS_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import {
  useArkadeAutonomousModeActive,
  useArkadeRenewMutation,
  useArkadeVtxoExpiryQuery,
  useHasPendingBatchIntentKind,
} from '@/hooks/useArkadeQueries'
import { isIntentSubmitPhase } from '@/lib/arkade/arkade-pending-batch-intent'

export function ArkadeRenewVtxosButton() {
  const expiryQuery = useArkadeVtxoExpiryQuery()
  const renewMutation = useArkadeRenewMutation()
  const hasPendingRenewIntent = useHasPendingBatchIntentKind('renew')
  const autonomousModeActive = useArkadeAutonomousModeActive()
  const renewSubmitPhase = isIntentSubmitPhase({
    mutationPending: renewMutation.isPending,
    pendingForAction: hasPendingRenewIntent,
  })
  const renewAppearance =
    (expiryQuery.data?.expiringSoonCount ?? 0) > 0 ? 'primary' : 'secondary'

  return (
    <InfomodeWrapper
      infoId={ARKADE_INFOMODE_IDS.renewVtxos}
      infoTitle={ARKADE_RENEW_VTXOS_INFOMODE.title}
      infoText={ARKADE_RENEW_VTXOS_INFOMODE.text}
      as="span"
    >
      <DesignButton
        type="button"
        appearance={renewAppearance}
        disabled={autonomousModeActive || renewMutation.isPending || hasPendingRenewIntent}
        onClick={() => renewMutation.mutate()}
        icon={renewSubmitPhase ? <Loader2 className="animate-spin" aria-hidden /> : undefined}
      >
        {renewSubmitPhase ? 'Renewing…' : 'Renew VTXOs now'}
      </DesignButton>
    </InfomodeWrapper>
  )
}
