import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
import { DialogDescription } from '@/components/ui/dialog'
import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'

interface AbortUnilateralExitInfoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onContinue: () => void
}

export function AbortUnilateralExitInfoModal({
  open,
  onOpenChange,
  onContinue,
}: AbortUnilateralExitInfoModalProps) {
  return (
    <AppModal
      isOpen={open}
      onOpenChange={onOpenChange}
      onCancel={() => onOpenChange(false)}
      title="Abort unilateral exit?"
      contentClassName="sm:max-w-lg"
      footer={(requestClose) => (
        <>
          <Button type="button" variant="outline" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            data-testid="unilateral-exit-abort-info-continue"
            onClick={() => {
              onContinue()
              requestClose()
            }}
          >
            Continue
          </Button>
        </>
      )}
      footerClassName="justify-end gap-2"
    >
      <div
        className="space-y-4 text-sm text-muted-foreground"
        data-testid="unilateral-exit-abort-info-modal"
      >
        <DialogDescription className="sr-only">
          Information about the risks of aborting an active unilateral exit.
        </DialogDescription>
        <p>
          <strong className="text-foreground">Started exits must be completed promptly.</strong>{' '}
          If you stop orchestrating a unilateral exit without finishing it in a timely fashion, the
          operator can trigger defenses that may seize certain VTXOs while the server is still
          reachable.
        </p>
        <p>
          Aborting stops this wallet&apos;s automatic unroll and clears the frontend job. Your
          unilateral exit materials and in-progress state on the backend remain — you can restart
          the exit later from this page.
        </p>
        <p>
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
          {' · '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.unilateralExitRisks}>
            Risks of unilateral exit
          </ArticleLink>
        </p>
      </div>
    </AppModal>
  )
}
