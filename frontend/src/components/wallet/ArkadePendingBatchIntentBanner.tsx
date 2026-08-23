import { useEffect, useRef } from 'react'
import { Hourglass, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  ARKADE_INFOMODE_IDS,
  ARKADE_PENDING_BATCH_INTENT_PROCESSING_INFOMODE,
  ARKADE_PENDING_BATCH_INTENT_TIMED_OUT_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INTENT_LIFECYCLE_PHASES,
  classifyPendingIntentDisappearance,
  clearedPendingBatchIntents,
  consumePendingBatchIntentCancelled,
  consumePendingBatchIntentSettledByMutation,
  pendingBatchIntentCancelledMessage,
  pendingBatchIntentKey,
  pendingBatchIntentDurationHint,
  pendingBatchIntentProcessingMessage,
  pendingBatchIntentSucceededMessage,
  pendingBatchIntentTimedOutMessage,
  pendingIntentAllowsCancel,
  pendingIntentAllowsRetry,
  pendingIntentBannerPhase,
} from '@/lib/arkade/arkade-pending-batch-intent'
import {
  useArkadeBoardingStatusQuery,
  useArkadeCancelPendingBatchIntentMutation,
  useArkadeRetryPendingBatchIntentMutation,
  usePendingBatchIntents,
} from '@/hooks/useArkadeQueries'
import type { ArkadePendingBatchIntent } from '@/workers/arkade-api'
import { toast } from 'sonner'

function pendingIntentBannerInfomode(intent: ArkadePendingBatchIntent) {
  return pendingIntentBannerPhase(intent) === ARKADE_INTENT_LIFECYCLE_PHASES.processing
    ? ARKADE_PENDING_BATCH_INTENT_PROCESSING_INFOMODE
    : ARKADE_PENDING_BATCH_INTENT_TIMED_OUT_INFOMODE
}

export function ArkadePendingBatchIntentBanner() {
  const pendingIntents = usePendingBatchIntents()
  const boardingStatusQuery = useArkadeBoardingStatusQuery()
  const previousPendingIntentsRef = useRef<ArkadePendingBatchIntent[] | undefined>(undefined)
  const cancelIntentMutation = useArkadeCancelPendingBatchIntentMutation()
  const retryIntentMutation = useArkadeRetryPendingBatchIntentMutation()

  useEffect(() => {
    if (previousPendingIntentsRef.current !== undefined) {
      const boardingExpiredSats = boardingStatusQuery.data?.expiredSats ?? 0
      for (const previousIntent of clearedPendingBatchIntents(
        previousPendingIntentsRef.current,
        pendingIntents,
      )) {
        const intentKey = pendingBatchIntentKey(previousIntent)
        const disappearance = classifyPendingIntentDisappearance({
          previousIntent,
          cancelled: consumePendingBatchIntentCancelled(intentKey),
          settledByMutation: consumePendingBatchIntentSettledByMutation(intentKey),
          boardingExpiredSats,
        })
        if (disappearance.type === 'cancelled') {
          toast.message(pendingBatchIntentCancelledMessage())
          continue
        }
        if (disappearance.type === 'succeeded') {
          toast.success(pendingBatchIntentSucceededMessage(disappearance.kind))
        }
      }
    }
    previousPendingIntentsRef.current = pendingIntents
  }, [pendingIntents, boardingStatusQuery.data?.expiredSats])

  if (pendingIntents.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      {pendingIntents.map((pendingIntent) => {
        const rowKey = pendingBatchIntentKey(pendingIntent)
        const bannerPhase = pendingIntentBannerPhase(pendingIntent)
        const isProcessing = bannerPhase === ARKADE_INTENT_LIFECYCLE_PHASES.processing
        const infomode = pendingIntentBannerInfomode(pendingIntent)
        const mutationInFlightForRow =
          (cancelIntentMutation.isPending &&
            pendingBatchIntentKey(cancelIntentMutation.variables ?? pendingIntent) === rowKey) ||
          (retryIntentMutation.isPending &&
            pendingBatchIntentKey(retryIntentMutation.variables ?? pendingIntent) === rowKey)
        const showCancel = pendingIntentAllowsCancel(pendingIntent)
        const showRetry = pendingIntentAllowsRetry(pendingIntent)
        return (
          <div
            key={rowKey}
            className="rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-sm"
            role="status"
            data-testid="arkade-pending-batch-intent-banner"
            data-lifecycle-phase={bannerPhase}
          >
            <div className="flex items-start gap-2">
              {isProcessing ? (
                <Loader2
                  className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-sky-700 dark:text-sky-300"
                  aria-hidden
                  data-testid="arkade-pending-batch-intent-processing-spinner"
                />
              ) : (
                <Hourglass
                  className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300"
                  aria-hidden
                  data-testid="arkade-pending-batch-intent-timed-out-icon"
                />
              )}
              <div className="space-y-2">
                <InfomodeWrapper
                  infoId={ARKADE_INFOMODE_IDS.pendingBatchIntentBanner}
                  infoTitle={infomode.title}
                  infoText={infomode.text}
                  as="span"
                >
                  <p className="font-medium">{infomode.title}</p>
                </InfomodeWrapper>
                <p className="text-muted-foreground">
                  {isProcessing
                    ? `${pendingBatchIntentProcessingMessage(pendingIntent.kind)} ${pendingBatchIntentDurationHint()}`
                    : pendingBatchIntentTimedOutMessage(pendingIntent.kind)}
                </p>
                {showCancel || showRetry ? (
                  <div className="flex gap-2">
                    {showCancel ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={mutationInFlightForRow}
                        onClick={() => cancelIntentMutation.mutate(pendingIntent)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                    {showRetry ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={mutationInFlightForRow}
                        onClick={() => retryIntentMutation.mutate(pendingIntent)}
                      >
                        Retry
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
