import { useEffect, useState } from 'react'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignDestructiveButton } from '@/components/design/DesignDestructiveButton'
import { DesignModal } from '@/components/design/DesignModal'
import { DialogDescription } from '@/components/ui/dialog'
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
    <DesignModal
      isOpen={open}
      onOpenChange={onOpenChange}
      onCancel={() => onOpenChange(false)}
      title="Start unilateral exit?"
      optIn={{
        id: 'unilateral-exit-start-ack',
        label: 'I understand these risks and want to start unilateral exit',
        checked: acknowledgedRisks,
        onChange: setAcknowledgedRisks,
        testId: 'unilateral-exit-start-ack',
      }}
      footer={(requestClose) => (
        <>
          <DesignButton type="button" appearance="secondary" onClick={requestClose}>
            Cancel
          </DesignButton>
          <DesignDestructiveButton
            type="button"
            disabled={!acknowledgedRisks}
            data-testid="unilateral-exit-start-confirm"
            onClick={() => {
              onConfirm()
              requestClose()
            }}
          >
            Start unroll
          </DesignDestructiveButton>
        </>
      )}
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
      </div>
    </DesignModal>
  )
}
