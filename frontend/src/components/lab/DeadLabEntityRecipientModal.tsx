import { DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AppModal } from '@/components/AppModal'
import type { AddressType } from '@/lib/wallet-domain-types'
import { LabAddressTypeBadge } from '@/components/lab/LabAddressTypeBadge'

interface DeadLabEntityRecipientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityDisplayName: string
  /** When set, shows the same address-type badge as elsewhere in Lab. */
  addressType?: AddressType
  onConfirm: () => void
  onCancel: () => void
  isPending?: boolean
}

export function DeadLabEntityRecipientModal({
  open,
  onOpenChange,
  entityDisplayName,
  addressType,
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
        <span className="inline-flex flex-wrap items-center gap-2">
          You are trying to send to an address belonging to the DEAD Lab entity{' '}
          <span className="font-medium">{entityDisplayName}</span>
          {addressType != null ? <LabAddressTypeBadge addressType={addressType} /> : null}
          . That is generally not a good idea. Proceed anyway?
        </span>
      </DialogDescription>
    </AppModal>
  )
}
