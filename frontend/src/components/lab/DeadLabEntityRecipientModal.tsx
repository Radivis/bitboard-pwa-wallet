import { DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AppModal } from '@/components/AppModal'

interface DeadLabEntityRecipientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityDisplayName: string
  onConfirm: () => void
  onCancel: () => void
  isPending?: boolean
}

export function DeadLabEntityRecipientModal({
  open,
  onOpenChange,
  entityDisplayName,
  onConfirm,
  onCancel,
  isPending = false,
}: DeadLabEntityRecipientModalProps) {
  return (
    <AppModal
      isOpen={open}
      onOpenChange={onOpenChange}
      title="Send to dead lab entity?"
      onCancel={onCancel}
      footer={(requestClose) => (
        <>
          <Button type="button" variant="outline" onClick={requestClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending}>
            Proceed anyway
          </Button>
        </>
      )}
    >
      <DialogDescription className="text-left">
        You are trying to send to an address belonging to the DEAD Lab entity {entityDisplayName}.
        That is generally not a good idea. Proceed anyway?
      </DialogDescription>
    </AppModal>
  )
}
