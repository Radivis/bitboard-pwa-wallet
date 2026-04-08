import { DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AppModal } from '@/components/AppModal'

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
  return (
    <AppModal
      isOpen={open}
      onOpenChange={() => {}}
      title={title}
      onCancel={onCancel}
      footer={(requestClose) => (
        <>
          <Button type="button" variant="outline" onClick={requestClose}>
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </>
      )}
    >
      <DialogDescription className="text-left">{message}</DialogDescription>
    </AppModal>
  )
}
