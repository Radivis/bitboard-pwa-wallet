import { Loader2 } from 'lucide-react'
import { DialogDescription } from '@/components/ui/dialog'
import { DesignButton } from '@/components/design/DesignButton'
import { AppModal } from '@/components/AppModal'
import { OperatorConfigDiffViewer } from '@/components/wallet/OperatorConfigDiffViewer'
import {
  useAcceptOperatorConfigMutation,
  useOperatorConfigDiffQuery,
  useReviewOperatorConfigInAutonomousMutation,
} from '@/hooks/useArkadeQueries'

interface OperatorConfigTrustModalProps {
  open: boolean
}

export function OperatorConfigTrustModal({ open }: OperatorConfigTrustModalProps) {
  const diffQuery = useOperatorConfigDiffQuery(open)
  const reviewMutation = useReviewOperatorConfigInAutonomousMutation()
  const acceptMutation = useAcceptOperatorConfigMutation()
  const pending = reviewMutation.isPending || acceptMutation.isPending

  return (
    <AppModal
      isOpen={open}
      onOpenChange={() => {}}
      title="Operator configuration changed"
      onCancel={() => {}}
      isBlockDismissed
      isCloseButtonHidden
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DesignButton
            type="button"
            appearance="secondary"
            disabled={pending}
            onClick={() => acceptMutation.mutate()}
            icon={
              acceptMutation.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : undefined
            }
          >
            Trust Arkade operator and accept changes
          </DesignButton>
          <DesignButton
            type="button"
            autoFocus
            disabled={pending}
            onClick={() => reviewMutation.mutate()}
            icon={
              reviewMutation.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : undefined
            }
          >
            Review changes safely in autonomous mode
          </DesignButton>
        </div>
      }
    >
      <DialogDescription className="text-left text-sm text-muted-foreground">
        Your Arkade service provider published new operator terms or configuration. Regular sync is paused until you choose how to proceed. You can trust the ASP
        and accept the new settings, or review the differences in autonomous mode using your
        last trusted configuration.
      </DialogDescription>
      {diffQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading configuration diff…
        </div>
      ) : diffQuery.data ? (
        <OperatorConfigDiffViewer entries={diffQuery.data.entries} />
      ) : null}
    </AppModal>
  )
}
