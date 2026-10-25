import { DialogDescription } from '@/components/ui/dialog'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignModal } from '@/components/design/DesignModal'
import type { AddressType } from '@/lib/wallet/wallet-domain-types'
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
    <DesignModal
      isOpen={open}
      onOpenChange={onOpenChange}
      title="Send to dead lab entity?"
      onCancel={onCancel}
      footer={(requestClose) => (
        <>
          <DesignButton type="button" appearance="secondary" onClick={requestClose} disabled={isPending}>
            Cancel
          </DesignButton>
          <DesignButton type="button" onClick={onConfirm} disabled={isPending}>
            Proceed anyway
          </DesignButton>
        </>
      )}
    >
      <DialogDescription className="text-left">
        <span className="inline-flex flex-wrap items-center gap-2">
          You are trying to send to an address belonging to the DEAD Lab entity{' '}
          <span className="design-type-emphasis">{entityDisplayName}</span>
          {addressType != null ? <LabAddressTypeBadge addressType={addressType} /> : null}
          . That is generally not a good idea. Proceed anyway?
        </span>
      </DialogDescription>
    </DesignModal>
  )
}
