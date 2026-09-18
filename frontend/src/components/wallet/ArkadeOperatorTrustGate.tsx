import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OperatorConfigDiffViewer } from '@/components/wallet/OperatorConfigDiffViewer'
import { OperatorConfigTrustModal } from '@/components/wallet/OperatorConfigTrustModal'
import {
  useAcceptOperatorConfigMutation,
  useOperatorConfigDiffQuery,
  useOperatorTrustStatusQuery,
  useReviewOperatorConfigInAutonomousMutation,
} from '@/hooks/useArkadeQueries'

export function ArkadeOperatorTrustGate() {
  const trustStatusQuery = useOperatorTrustStatusQuery()
  const trustStatus = trustStatusQuery.data
  const showModal =
    trustStatus?.operatorTrustPending === true && trustStatus.reviewingInAutonomous !== true
  const showReviewBanner = trustStatus?.reviewingInAutonomous === true
  const diffQuery = useOperatorConfigDiffQuery(
    trustStatus?.operatorTrustPending === true,
  )
  const reviewMutation = useReviewOperatorConfigInAutonomousMutation()
  const acceptMutation = useAcceptOperatorConfigMutation()
  const pending = reviewMutation.isPending || acceptMutation.isPending

  return (
    <>
      <OperatorConfigTrustModal open={showModal} />
      {showReviewBanner ? (
        <div
          className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          data-testid="arkade-operator-trust-review-banner"
        >
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Operator configuration review in progress
          </p>
          <p className="text-muted-foreground">
            Autonomous mode is active with your last trusted operator settings. Continue reviewing
            offline or accept the ASP changes when you are ready to resume regular sync.
          </p>
          {diffQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading configuration diff…
            </div>
          ) : diffQuery.data ? (
            <OperatorConfigDiffViewer entries={diffQuery.data.entries} />
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => acceptMutation.mutate()}
            >
              {acceptMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Trust Arkade operator and accept changes
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => reviewMutation.mutate()}
            >
              {reviewMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Continue review safely in autonomous mode
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
