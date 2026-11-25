import { DesignButton } from '@/components/design/DesignButton'
import { DesignDestructiveButton } from '@/components/design/DesignDestructiveButton'
import { DesignModal } from '@/components/design/DesignModal'
import { DialogDescription } from '@/components/ui/dialog'

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
  variant = 'default',
}: ConfirmationDialogProps) {
  const confirmButton =
    variant === 'destructive' ? (
      <DesignDestructiveButton type="button" onClick={onConfirm}>
        {confirmText}
      </DesignDestructiveButton>
    ) : (
      <DesignButton type="button" onClick={onConfirm}>
        {confirmText}
      </DesignButton>
    )

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
          {confirmButton}
        </>
      )}
    >
      <DialogDescription className="text-left">{message}</DialogDescription>
    </DesignModal>
  )
}
