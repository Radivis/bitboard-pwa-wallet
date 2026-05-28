import { Badge } from '@/components/ui/badge'
import { ADDRESS_TYPE_LABELS } from '@/stores/walletStore'
import { useFeatureStore } from '@/stores/featureStore'
import type { AddressType } from '@/lib/wallet/wallet-domain-types'

export function LabAddressTypeBadge({ addressType }: { addressType: AddressType }) {
  const isSegwitAddressesEnabled = useFeatureStore((featureState) => featureState.isSegwitAddressesEnabled)
  if (!isSegwitAddressesEnabled) return null
  return (
    <Badge variant="secondary" className="font-normal">
      {ADDRESS_TYPE_LABELS[addressType]}
    </Badge>
  )
}
