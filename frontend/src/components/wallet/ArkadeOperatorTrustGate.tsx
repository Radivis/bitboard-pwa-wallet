import { Loader2 } from 'lucide-react'
import { DesignBanner } from '@/components/design/DesignBanner'
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
        <DesignBanner
          role="status"
          status="warning"
          data-testid="arkade-operator-trust-review-banner"
          title="Operator configuration review in progress"
          description="Autonomous mode is active with your last trusted operator settings. Continue reviewing offline or accept the ASP changes when you are ready to resume regular sync."
          optionalContent={
            diffQuery.isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading configuration diff…
              </div>
            ) : diffQuery.data ? (
              <OperatorConfigDiffViewer entries={diffQuery.data.entries} />
            ) : null
          }
          primaryAction={{
            label: 'Trust Arkade operator and accept changes',
            disabled: pending,
            onClick: () => acceptMutation.mutate(),
            icon: acceptMutation.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : undefined,
          }}
          secondaryAction={{
            label: 'Continue review safely in autonomous mode',
            disabled: pending,
            onClick: () => reviewMutation.mutate(),
            icon: reviewMutation.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : undefined,
          }}
        />
      ) : null}
    </>
  )
}
