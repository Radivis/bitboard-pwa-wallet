import { useEffect, useState } from 'react'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignDestructiveButton } from '@/components/design/DesignDestructiveButton'
import { DesignModal } from '@/components/design/DesignModal'
import { DialogDescription } from '@/components/ui/dialog'

interface AbortUnilateralExitConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function AbortUnilateralExitConfirmModal({
  open,
  onOpenChange,
  onConfirm,
}: AbortUnilateralExitConfirmModalProps) {
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
      title="Confirm abort unilateral exit"
      optIn={{
        id: 'abort-unilateral-exit-acknowledge',
        label: 'I understand the risks of aborting an unilateral exit',
        checked: acknowledgedRisks,
        onChange: setAcknowledgedRisks,
        testId: 'unilateral-exit-abort-acknowledge',
      }}
      footer={(requestClose) => (
        <>
          <DesignButton type="button" appearance="secondary" onClick={requestClose}>
            Cancel
          </DesignButton>
          <DesignDestructiveButton
            type="button"
            disabled={!acknowledgedRisks}
            data-testid="unilateral-exit-abort-confirm"
            onClick={() => {
              onConfirm()
              requestClose()
            }}
          >
            Abort unilateral exit
          </DesignDestructiveButton>
        </>
      )}
    >
      <div
        className="space-y-4 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        data-testid="unilateral-exit-abort-confirm-modal"
      >
        <DialogDescription className="sr-only">
          Final confirmation before aborting an active unilateral exit.
        </DialogDescription>
        <p className="font-medium text-destructive">
          You may lose funds if you do not restart this exit soon.
        </p>
        <p>
          Aborting leaves your unilateral exit incomplete on-chain. While the operator is online,
          unfinished exits can allow seizure of affected VTXOs. Only abort if you understand you
          must restart the exit promptly.
        </p>
      </div>
    </DesignModal>
  )
}
