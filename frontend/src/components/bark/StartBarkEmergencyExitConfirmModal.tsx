import { useEffect, useState } from 'react'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignModal } from '@/components/design/DesignModal'
import { Button } from '@/components/ui/button'
import { DialogDescription } from '@/components/ui/dialog'

interface StartBarkEmergencyExitConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function StartBarkEmergencyExitConfirmModal({
  open,
  onOpenChange,
  onConfirm,
}: StartBarkEmergencyExitConfirmModalProps) {
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
      title="Start emergency exit?"
      optIn={{
        id: 'bark-emergency-exit-start-ack',
        label: 'I understand these risks and want to start emergency exit',
        checked: acknowledgedRisks,
        onChange: setAcknowledgedRisks,
        testId: 'bark-emergency-exit-start-ack',
      }}
      footer={(requestClose) => (
        <>
          <DesignButton type="button" appearance="secondary" onClick={requestClose}>
            Cancel
          </DesignButton>
          <Button
            type="button"
            variant="destructive"
            disabled={!acknowledgedRisks}
            data-testid="bark-emergency-exit-start-confirm"
            onClick={() => {
              onConfirm()
              requestClose()
            }}
          >
            Start emergency exit
          </Button>
        </>
      )}
    >
      <div
        className="space-y-4 text-sm text-muted-foreground"
        data-testid="bark-emergency-exit-start-confirm-modal"
      >
        <DialogDescription className="sr-only">
          Confirm that you understand the risks of starting an emergency exit before proceeding.
        </DialogDescription>
        <p>
          <strong className="text-foreground">Loss of funds if the server is still online.</strong>{' '}
          Starting an emergency exit without finishing it lets the operator broadcast checkpoint
          transactions that seize the remaining coins. If the server is reachable, progress the exit,
          wait out the timelock, and claim promptly.
        </p>
        <p>
          <strong className="text-foreground">High on-chain fees.</strong> Emergency exit publishes
          many on-chain transactions. Each step costs miner fees from your on-chain wallet, and fees
          can spike when many users exit at once.
        </p>
      </div>
    </DesignModal>
  )
}
