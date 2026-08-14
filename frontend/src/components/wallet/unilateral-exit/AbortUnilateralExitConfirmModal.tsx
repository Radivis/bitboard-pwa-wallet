import { useEffect, useState } from 'react'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
import { DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

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
    <AppModal
      isOpen={open}
      onOpenChange={onOpenChange}
      onCancel={() => onOpenChange(false)}
      title="Confirm abort unilateral exit"
      contentClassName="sm:max-w-lg border-destructive"
      footer={(requestClose) => (
        <>
          <Button type="button" variant="outline" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!acknowledgedRisks}
            data-testid="unilateral-exit-abort-confirm"
            onClick={() => {
              onConfirm()
              requestClose()
            }}
          >
            Abort unilateral exit
          </Button>
        </>
      )}
      footerClassName="justify-end gap-2"
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
        <div className="flex items-start gap-2 text-foreground">
          <input
            id="abort-unilateral-exit-acknowledge"
            type="checkbox"
            className="mt-1"
            checked={acknowledgedRisks}
            onChange={(event) => setAcknowledgedRisks(event.target.checked)}
            data-testid="unilateral-exit-abort-acknowledge"
          />
          <Label htmlFor="abort-unilateral-exit-acknowledge" className="text-sm leading-snug">
            I understand the risks of aborting an unilateral exit
          </Label>
        </div>
      </div>
    </AppModal>
  )
}
