import { useEffect, useState } from 'react'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
import { DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface ArkadeEnableConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ArkadeEnableConfirmModal({
  open,
  onOpenChange,
  onConfirm,
}: ArkadeEnableConfirmModalProps) {
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
      title="Enable Arkade"
      contentClassName="sm:max-w-lg"
      footer={(requestClose) => (
        <>
          <Button type="button" variant="outline" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!acknowledgedRisks}
            onClick={() => {
              onConfirm()
              requestClose()
            }}
          >
            Enable Arkade
          </Button>
        </>
      )}
      footerClassName="justify-end gap-2"
    >
      <div className="space-y-4 text-sm text-muted-foreground">
        <DialogDescription className="sr-only">
          Confirm that you understand Arkade is a new feature and how to use it safely before
          enabling.
        </DialogDescription>
        <p>
          <strong className="text-foreground">Arkade support is brand new</strong> in Bitboard
          Wallet. Behavior, operator connectivity, and edge cases are still being hardened.
        </p>
        <p>
          <strong className="text-foreground">Signet is strongly advised</strong> for trying
          Arkade—use Mutinynet signet coins with no real-world value while you learn boarding,
          payments, and exits.
        </p>
        <p>
          If you use Arkade on <strong className="text-foreground">Mainnet</strong>, limit amounts
          to <strong className="text-foreground">very small sums</strong> you can afford to lose
          while the feature matures.
        </p>
        <div className="flex gap-3 rounded-md border border-border p-3">
          <input
            id="arkade-enable-ack"
            type="checkbox"
            className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
            checked={acknowledgedRisks}
            onChange={(event) => setAcknowledgedRisks(event.target.checked)}
          />
          <Label htmlFor="arkade-enable-ack" className="cursor-pointer font-normal">
            I understand Arkade is new, and accept the associated risks
          </Label>
        </div>
      </div>
    </AppModal>
  )
}
