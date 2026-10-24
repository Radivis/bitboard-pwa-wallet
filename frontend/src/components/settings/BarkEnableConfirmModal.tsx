import { useEffect, useState } from 'react'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignModal } from '@/components/design/DesignModal'
import { DialogDescription } from '@/components/ui/dialog'

interface BarkEnableConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function BarkEnableConfirmModal({
  open,
  onOpenChange,
  onConfirm,
}: BarkEnableConfirmModalProps) {
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
      title="Enable Bark"
      optIn={{
        id: 'bark-enable-ack',
        label: 'I understand Bark is new, and accept the associated risks',
        checked: acknowledgedRisks,
        onChange: setAcknowledgedRisks,
      }}
      footer={(requestClose) => (
        <>
          <DesignButton type="button" appearance="secondary" onClick={requestClose}>
            Cancel
          </DesignButton>
          <DesignButton
            type="button"
            disabled={!acknowledgedRisks}
            onClick={() => {
              onConfirm()
              requestClose()
            }}
          >
            Enable Bark
          </DesignButton>
        </>
      )}
    >
      <div className="space-y-4 text-sm text-muted-foreground">
        <DialogDescription className="sr-only">
          Confirm that you understand Bark is a new feature and how to use it safely before
          enabling.
        </DialogDescription>
        <p>
          <strong className="text-foreground">Bark support is brand new</strong> in Bitboard
          Wallet. Not everything that works in Arkade works in Bark yet.
        </p>
        <p>
          <strong className="text-foreground">Signet is strongly advised</strong> for trying
          Bark—use public Signet coins with no real-world value while you learn boarding,
          payments, and exits.
        </p>
        <p>
          If you use Bark on <strong className="text-foreground">Mainnet</strong>, limit amounts
          to <strong className="text-foreground">very small sums</strong> you can afford to lose
          while the feature matures.
        </p>
      </div>
    </DesignModal>
  )
}
