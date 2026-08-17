import { useEffect, useRef } from 'react'
import { Hourglass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  ARKADE_INFOMODE_IDS,
  ARKADE_PENDING_BATCH_INTENT_BANNER_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import {
  pendingBatchIntentClearedMessage,
  pendingBatchIntentKey,
  pendingBatchIntentKindLabel,
  pendingBatchIntentWaitingMessage,
} from '@/lib/arkade/arkade-pending-batch-intent'
import {
  useArkadeCancelPendingBatchIntentMutation,
  useArkadeRetryPendingBatchIntentMutation,
  usePendingBatchIntents,
} from '@/hooks/useArkadeQueries'
import { toast } from 'sonner'

export function ArkadePendingBatchIntentBanner() {
  const pendingIntents = usePendingBatchIntents()
  const previousPendingIntentKeysRef = useRef<string[] | undefined>(undefined)
  const cancelIntentMutation = useArkadeCancelPendingBatchIntentMutation()
  const retryIntentMutation = useArkadeRetryPendingBatchIntentMutation()

  useEffect(() => {
    const currentKeys = pendingIntents.map(pendingBatchIntentKey)
    if (previousPendingIntentKeysRef.current !== undefined) {
      const previousKeys = new Set(previousPendingIntentKeysRef.current)
      const hasClearedIntent = [...previousKeys].some((key) => !currentKeys.includes(key))
      if (hasClearedIntent) {
        toast.success(pendingBatchIntentClearedMessage())
      }
    }
    previousPendingIntentKeysRef.current = currentKeys
  }, [pendingIntents])

  if (pendingIntents.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      {pendingIntents.map((pendingIntent) => {
        const rowKey = pendingBatchIntentKey(pendingIntent)
        const mutationInFlightForRow =
          (cancelIntentMutation.isPending &&
            pendingBatchIntentKey(cancelIntentMutation.variables ?? pendingIntent) === rowKey) ||
          (retryIntentMutation.isPending &&
            pendingBatchIntentKey(retryIntentMutation.variables ?? pendingIntent) === rowKey)
        return (
          <div
            key={rowKey}
            className="rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-sm"
            role="status"
            data-testid="arkade-pending-batch-intent-banner"
          >
            <div className="flex items-start gap-2">
              <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />
              <div className="space-y-2">
                <InfomodeWrapper
                  infoId={ARKADE_INFOMODE_IDS.pendingBatchIntentBanner}
                  infoTitle={ARKADE_PENDING_BATCH_INTENT_BANNER_INFOMODE.title}
                  infoText={ARKADE_PENDING_BATCH_INTENT_BANNER_INFOMODE.text}
                  as="span"
                >
                  <p className="font-medium">Waiting for Arkade operator</p>
                </InfomodeWrapper>
                <p className="text-muted-foreground">
                  {pendingBatchIntentWaitingMessage(pendingIntent.kind)} This applies to your{' '}
                  {pendingBatchIntentKindLabel(pendingIntent.kind)} outpoints only.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={mutationInFlightForRow}
                    onClick={() => cancelIntentMutation.mutate(pendingIntent)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={mutationInFlightForRow}
                    onClick={() => retryIntentMutation.mutate(pendingIntent)}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
