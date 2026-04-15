import { Badge } from '@/components/ui/badge'
import { ADDRESS_TYPE_LABELS } from '@/stores/walletStore'
import { useFeatureStore } from '@/stores/featureStore'
import type { AddressType } from '@/lib/wallet-domain-types'

export function LabAddressTypeBadge({ addressType }: { addressType: AddressType }) {
  const segwitAddressesEnabled = useFeatureStore((s) => s.segwitAddressesEnabled)
  if (!segwitAddressesEnabled) return null
  return (
    <Badge variant="secondary" className="font-normal">
      {ADDRESS_TYPE_LABELS[addressType]}
    </Badge>
  )
}
