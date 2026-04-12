import { useEffect, useState } from 'react'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
import { DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface MainnetAccessConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function MainnetAccessConfirmModal({
  open,
  onOpenChange,
  onConfirm,
}: MainnetAccessConfirmModalProps) {
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
      title="Mainnet access"
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
            Activate access
          </Button>
        </>
      )}
      footerClassName="justify-end gap-2"
    >
      <div className="space-y-4 text-sm text-muted-foreground">
        <DialogDescription className="sr-only">
          Confirm that you understand Mainnet risks and have a seed phrase backup before
          enabling Mainnet access.
        </DialogDescription>
        <p>
          Bitboard Wallet is an <strong className="text-foreground">early demo</strong>.
          Using real bitcoin on Mainnet is only appropriate for{' '}
          <strong className="text-foreground">experienced Bitcoin users</strong>, and even
          then only with <strong className="text-foreground">tiny amounts</strong>.
        </p>
        <p>
          <strong className="text-foreground">Stability is not guaranteed</strong> during
          this demo phase. Safeguarding coins depends crucially on having a{' '}
          <strong className="text-foreground">secure backup of your seed phrase</strong>.
        </p>
        <div className="flex gap-3 rounded-md border border-border p-3">
          <input
            id="mainnet-access-ack"
            type="checkbox"
            className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
            checked={acknowledgedRisks}
            onChange={(e) => setAcknowledgedRisks(e.target.checked)}
          />
          <Label htmlFor="mainnet-access-ack" className="cursor-pointer font-normal">
            I understand the risks and have a seed phrase backup ready
          </Label>
        </div>
      </div>
    </AppModal>
  )
}
