import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
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
        <Button type="button" onClick={requestClose}>
          OK
        </Button>
      )}
      footerClassName="justify-end"
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <DialogDescription className="sr-only">
          Warning that Bitboard Wallet is in demo mode on Mainnet and funds are not secure.
        </DialogDescription>
        <p>
          <strong className="text-foreground">Bitboard Wallet is still in DEMO MODE.</strong>
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
