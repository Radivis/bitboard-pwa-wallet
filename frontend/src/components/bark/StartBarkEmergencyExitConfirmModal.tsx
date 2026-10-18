import { useEffect, useState } from 'react'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
import { DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ArticleLink } from '@/lib/library/article-shared'

export const BARK_EMERGENCY_EXIT_RISK_ARTICLE_SLUG = 'differences-between-vtxos-in-arkade-and-bark'

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
    <AppModal
      isOpen={open}
      onOpenChange={onOpenChange}
      onCancel={() => onOpenChange(false)}
      title="Start emergency exit?"
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
      footerClassName="justify-end gap-2"
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
        <div className="flex gap-3 rounded-md border border-border p-3">
          <input
            id="bark-emergency-exit-start-ack"
            type="checkbox"
            className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
            checked={acknowledgedRisks}
            data-testid="bark-emergency-exit-start-ack"
            onChange={(event) => setAcknowledgedRisks(event.target.checked)}
          />
          <Label htmlFor="bark-emergency-exit-start-ack" className="cursor-pointer font-normal">
            I understand these risks and want to start emergency exit
          </Label>
        </div>
      </div>
    </AppModal>
  )
}
