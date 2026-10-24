import { DialogDescription } from '@/components/ui/dialog'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignModal } from '@/components/design/DesignModal'

interface ConfirmationDialogProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'default' | 'destructive'
}

export function ConfirmationDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  return (
    <DesignModal
      isOpen={open}
      onOpenChange={() => {}}
      title={title}
      onCancel={onCancel}
      footer={(requestClose) => (
        <>
          <DesignButton type="button" appearance="secondary" onClick={requestClose}>
            {cancelText}
          </DesignButton>
          <DesignButton type="button" onClick={onConfirm}>
            {confirmText}
          </DesignButton>
        </>
      )}
    >
      <DialogDescription className="text-left">{message}</DialogDescription>
    </DesignModal>
  )
}
