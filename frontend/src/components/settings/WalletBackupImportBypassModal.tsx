import { DialogDescription } from '@/components/ui/dialog'
import { DesignModal } from '@/components/design/DesignModal'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignDestructiveButton } from '@/components/design/DesignDestructiveButton'

interface WalletBackupImportBypassModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAbort: () => void
  onProceedAnyway: () => void | Promise<void>
  isBusy: boolean
}

export function WalletBackupImportBypassModal({
  open,
  onOpenChange,
  onAbort,
  onProceedAnyway,
  isBusy,
}: WalletBackupImportBypassModalProps) {
  return (
    <DesignModal
      isOpen={open}
      onOpenChange={onOpenChange}
      title="Could not verify backup"
      onCancel={onAbort}
      isBlockDismissed={isBusy}
      footer={() => (
        <>
          <DesignButton type="button" appearance="secondary" disabled={isBusy} onClick={onAbort}>
            Abort import
          </DesignButton>
          <DesignDestructiveButton
            type="button"
            disabled={isBusy}
            onClick={() => void onProceedAnyway()}
          >
            {isBusy ? 'Importing…' : 'Proceed anyway'}
          </DesignDestructiveButton>
        </>
      )}
    >
      <div className="design-type-regular space-y-3 text-left text-muted-foreground">
        <DialogDescription className="sr-only">
          Verification failed after three password attempts. Choose whether to abort or import
          without signature verification.
        </DialogDescription>
        <p className="text-foreground">
          The signature could not be verified after three attempts. That may mean the wrong
          password—or it may mean something else went wrong during verification, including a possible
          software bug, a corrupted backup file, or unauthorized tampering.
        </p>
        <p>
          You can abort and keep your current wallet data, or continue and replace local wallet data
          with the SQLite file from this ZIP <strong className="text-foreground">without</strong>{' '}
          verifying the cryptographic signature. Only continue if you accept that risk.
        </p>
      </div>
    </DesignModal>
  )
}
