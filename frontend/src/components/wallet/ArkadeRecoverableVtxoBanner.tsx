import { AlertTriangle, Loader2 } from 'lucide-react'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { Button } from '@/components/ui/button'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  ARKADE_INFOMODE_IDS,
  ARKADE_RECOVERABLE_VTXO_BANNER_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import {
  useArkadeBalanceQuery,
  useArkadeRecoverRecoverableVtxosMutation,
  useArkadeRecoverableVtxoFeeQuery,
} from '@/hooks/useArkadeQueries'

export function ArkadeRecoverableVtxoBanner() {
  const balanceQuery = useArkadeBalanceQuery()
  const recoverableVtxoCount = balanceQuery.data?.recoverableVtxoCount ?? 0
  const recoverableSats = balanceQuery.data?.recoverableSats ?? 0
  const feeQuery = useArkadeRecoverableVtxoFeeQuery({
    enabled: recoverableVtxoCount > 0,
  })
  const recoverMutation = useArkadeRecoverRecoverableVtxosMutation()

  if (recoverableVtxoCount <= 0) {
    return null
  }

  const feeEstimate = feeQuery.data
  const feeLoading = feeQuery.isLoading && feeEstimate == null
  const feeError = feeEstimate?.estimateError

  return (
    <div
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      role="status"
      data-testid="arkade-recoverable-vtxo-banner"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <div className="space-y-2">
          <InfomodeWrapper
            infoId={ARKADE_INFOMODE_IDS.recoverableVtxoBanner}
            infoTitle={ARKADE_RECOVERABLE_VTXO_BANNER_INFOMODE.title}
            infoText={ARKADE_RECOVERABLE_VTXO_BANNER_INFOMODE.text}
            as="span"
          >
            <p className="font-medium">Recoverable VTXOs</p>
          </InfomodeWrapper>
          <p className="text-muted-foreground">
            {recoverableVtxoCount} VTXO{recoverableVtxoCount === 1 ? '' : 's'} totaling{' '}
            <BitcoinAmountDisplay amountSats={recoverableSats} size="sm" /> can be
            batch-settled back into your Arkade balance.
          </p>
          {feeLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Estimating operator fee…
            </div>
          ) : feeEstimate?.estimatedTotalFeeSats != null &&
            feeEstimate.estimatedReceiveSats != null ? (
            <p className="text-muted-foreground">
              Estimated operator fee:{' '}
              <BitcoinAmountDisplay
                amountSats={feeEstimate.estimatedTotalFeeSats}
                size="sm"
              />
              . You would receive about{' '}
              <BitcoinAmountDisplay
                amountSats={feeEstimate.estimatedReceiveSats}
                size="sm"
              />
              .
            </p>
          ) : feeError != null ? (
            <p className="text-amber-700 dark:text-amber-400">
              Could not estimate the operator fee ({feeError}). You can still recover now.
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={recoverMutation.isPending}
            onClick={() => recoverMutation.mutate()}
          >
            {recoverMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Recovering…
              </>
            ) : (
              'Recover now'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
