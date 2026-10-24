import { Loader2 } from 'lucide-react'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { DesignBanner } from '@/components/design/DesignBanner'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  ARKADE_INFOMODE_IDS,
  ARKADE_RECOVERABLE_VTXO_BANNER_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import {
  useArkadeAutonomousModeActive,
  useArkadeBalanceQuery,
  useHasPendingBatchIntentKind,
  useArkadeRecoverRecoverableVtxosMutation,
  useArkadeRecoverableVtxoFeeQuery,
} from '@/hooks/useArkadeQueries'
import { isIntentSubmitPhase } from '@/lib/arkade/arkade-pending-batch-intent'

export function ArkadeRecoverableVtxoBanner() {
  const autonomousModeActive = useArkadeAutonomousModeActive()
  const hasPendingRecoverIntent = useHasPendingBatchIntentKind('recover')
  const balanceQuery = useArkadeBalanceQuery()
  const recoverableVtxoCount =
    balanceQuery.data?.recoverableSettleableVtxoCount ?? 0
  const recoverableSats = balanceQuery.data?.recoverableSettleableSats ?? 0
  const feeQuery = useArkadeRecoverableVtxoFeeQuery({
    enabled: recoverableVtxoCount > 0,
  })
  const recoverMutation = useArkadeRecoverRecoverableVtxosMutation()
  const recoverSubmitPhase = isIntentSubmitPhase({
    mutationPending: recoverMutation.isPending,
    pendingForAction: hasPendingRecoverIntent,
  })

  if (recoverableVtxoCount <= 0) {
    return null
  }

  const feeEstimate = feeQuery.data
  const feeLoading = feeQuery.isLoading && feeEstimate == null
  const feeError = feeEstimate?.estimateError

  return (
    <DesignBanner
      role="status"
      status="warning"
      data-testid="arkade-recoverable-vtxo-banner"
      title={
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.recoverableVtxoBanner}
          infoTitle={ARKADE_RECOVERABLE_VTXO_BANNER_INFOMODE.title}
          infoText={ARKADE_RECOVERABLE_VTXO_BANNER_INFOMODE.text}
          as="span"
        >
          Recoverable now
        </InfomodeWrapper>
      }
      description={
        <>
          {recoverableVtxoCount} VTXO{recoverableVtxoCount === 1 ? '' : 's'} totaling{' '}
          <BitcoinAmountDisplay amountSats={recoverableSats} size="sm" /> can be batch-settled
          back into your Arkade balance.
        </>
      }
      optionalContent={
        feeLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Estimating operator fee…
          </div>
        ) : feeEstimate?.estimatedTotalFeeSats != null &&
          feeEstimate.estimatedReceiveSats != null ? (
          <p>
            Estimated operator fee:{' '}
            <BitcoinAmountDisplay amountSats={feeEstimate.estimatedTotalFeeSats} size="sm" />.
            You would receive about{' '}
            <BitcoinAmountDisplay amountSats={feeEstimate.estimatedReceiveSats} size="sm" />.
          </p>
        ) : feeError != null ? (
          <p>Could not estimate the operator fee ({feeError}). You can still recover now.</p>
        ) : null
      }
      primaryAction={{
        label: recoverSubmitPhase ? 'Recovering…' : 'Recover now',
        disabled: autonomousModeActive || recoverMutation.isPending || hasPendingRecoverIntent,
        onClick: () => recoverMutation.mutate(),
        icon: recoverSubmitPhase ? <Loader2 className="animate-spin" aria-hidden /> : undefined,
      }}
    />
  )
}
