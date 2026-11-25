import { useEffect, useState } from 'react'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignModal } from '@/components/design/DesignModal'
import { DialogDescription } from '@/components/ui/dialog'

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
    <DesignModal
      isOpen={open}
      onOpenChange={onOpenChange}
      onCancel={() => onOpenChange(false)}
      title="Mainnet access"
      optIn={{
        id: 'mainnet-access-ack',
        label: 'I understand the risks and have a seed phrase backup ready',
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
            Activate access
          </DesignButton>
        </>
      )}
    >
      <div className="design-type-regular space-y-4 text-muted-foreground">
        <DialogDescription className="sr-only">
          Confirm that you understand Mainnet risks and have a seed phrase backup before
          enabling Mainnet access.
        </DialogDescription>
        <p>
          Bitcoin Codex is an <strong className="text-foreground">early demo</strong>.
          Using real bitcoin on Mainnet is only appropriate for{' '}
          <strong className="text-foreground">experienced Bitcoin users</strong>, and even
          then only with <strong className="text-foreground">tiny amounts</strong>.
        </p>
        <p>
          <strong className="text-foreground">Stability is not guaranteed</strong> during
          this demo phase. Safeguarding coins depends crucially on having a{' '}
          <strong className="text-foreground">secure backup of your seed phrase</strong>.
        </p>
      </div>
    </DesignModal>
  )
}
