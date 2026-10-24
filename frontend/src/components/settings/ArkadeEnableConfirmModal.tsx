import { useEffect, useState } from 'react'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignModal } from '@/components/design/DesignModal'
import { DialogDescription } from '@/components/ui/dialog'

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
    <DesignModal
      isOpen={open}
      onOpenChange={onOpenChange}
      onCancel={() => onOpenChange(false)}
      title="Enable Arkade"
      optIn={{
        id: 'arkade-enable-ack',
        label: 'I understand Arkade is new, and accept the associated risks',
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
            Enable Arkade
          </DesignButton>
        </>
      )}
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
      </div>
    </DesignModal>
  )
}
