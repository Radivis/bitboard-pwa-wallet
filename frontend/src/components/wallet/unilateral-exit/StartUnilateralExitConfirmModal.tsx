import { useEffect, useState } from 'react'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
import { DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'

interface StartUnilateralExitConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function StartUnilateralExitConfirmModal({
  open,
  onOpenChange,
  onConfirm,
}: StartUnilateralExitConfirmModalProps) {
  const [acknowledgedRisks, setAcknowledgedRisks] = useState(false)

  useEffect(() => {
    if (open) {
      setAcknowledgedRisks(false)
    }
  }, [open])

  return (
    <AppModal
      isOpen={open}
      onOpenChange={onOpenChange}
      onCancel={() => onOpenChange(false)}
      title="Start unilateral exit?"
      contentClassName="sm:max-w-lg"
      footer={(requestClose) => (
        <>
          <Button type="button" variant="outline" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!acknowledgedRisks}
            data-testid="unilateral-exit-start-confirm"
            onClick={() => {
              onConfirm()
              requestClose()
            }}
          >
            Start unroll
          </Button>
        </>
      )}
      footerClassName="justify-end gap-2"
    >
      <div
        className="space-y-4 text-sm text-muted-foreground"
        data-testid="unilateral-exit-start-confirm-modal"
      >
        <DialogDescription className="sr-only">
          Confirm that you understand the risks of starting a unilateral exit before proceeding.
        </DialogDescription>
        <p>
          <strong className="text-foreground">Loss of funds if the server is still online.</strong>{' '}
          Starting a unilateral exit without completing it in a timely fashion allows the operator to
          trigger a defense mechanism that can seize certain VTXOs. If the server is reachable,
          finish the unroll, wait out the timelock, and complete the exit promptly to avoid losing
          funds.
        </p>
        <p>
          <strong className="text-foreground">High on-chain fees.</strong> Unilateral exit publishes
          many on-chain transactions. Each unroll step costs miner fees from your bumper wallet, and
          fees can spike when many users exit at once.
        </p>
        <p>
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
          {' · '}
          <ArticleLink slug={ARKADE_LIBRARY_SLUGS.unilateralExitRisks}>
            Risks of unilateral exit
          </ArticleLink>
        </p>
        <div className="flex gap-3 rounded-md border border-border p-3">
          <input
            id="unilateral-exit-start-ack"
            type="checkbox"
            className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
            checked={acknowledgedRisks}
            data-testid="unilateral-exit-start-ack"
            onChange={(event) => setAcknowledgedRisks(event.target.checked)}
          />
          <Label htmlFor="unilateral-exit-start-ack" className="cursor-pointer font-normal">
            I understand these risks and want to start unilateral exit
          </Label>
        </div>
      </div>
    </AppModal>
  )
}
