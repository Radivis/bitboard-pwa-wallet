import { AppModal } from '@/components/AppModal'
import { DesignButton } from '@/components/design/DesignButton'
import { DialogDescription } from '@/components/ui/dialog'

interface ReceiveMainnetDemoWarningModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Shown on /wallet/receive when the committed network is Mainnet. Overlay/Escape are blocked;
 * user must tap OK.
 */
export function ReceiveMainnetDemoWarningModal({
  open,
  onOpenChange,
}: ReceiveMainnetDemoWarningModalProps) {
  return (
    <AppModal
      isOpen={open}
      onOpenChange={onOpenChange}
      onCancel={() => onOpenChange(false)}
      title="Demo mode (Mainnet)"
      contentClassName="sm:max-w-lg"
      isCloseButtonHidden
      onInteractOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => e.preventDefault()}
      footer={(requestClose) => (
        <DesignButton type="button" onClick={requestClose}>
          OK
        </DesignButton>
      )}
      footerClassName="justify-end"
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <DialogDescription className="sr-only">
          Warning that Bitcoin Codex is in demo mode on Mainnet and funds are not secure.
        </DialogDescription>
        <p>
          <strong className="text-foreground">Bitcoin Codex is still in DEMO MODE.</strong>
        </p>
        <p>
          Funds in this wallet must{' '}
          <strong className="text-foreground">under no circumstances</strong> be considered
          secure. Please only use minimal amounts for testing and experimentation.
        </p>
      </div>
    </AppModal>
  )
}
