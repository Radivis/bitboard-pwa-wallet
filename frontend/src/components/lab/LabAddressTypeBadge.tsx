import { Badge } from '@/components/ui/badge'
import { ADDRESS_TYPE_LABELS } from '@/stores/walletStore'
import type { AddressType } from '@/lib/wallet-domain-types'

export function LabAddressTypeBadge({ addressType }: { addressType: AddressType }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {ADDRESS_TYPE_LABELS[addressType]}
    </Badge>
  )
}
