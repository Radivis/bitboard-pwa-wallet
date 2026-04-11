import { Badge } from '@/components/ui/badge'

export function LabAddressTypeBadge({ addressType }: { addressType: string }) {
  const normalized = addressType.toLowerCase()
  const label = normalized === 'taproot' ? 'Taproot' : 'SegWit'
  return (
    <Badge variant="secondary" className="font-normal">
      {label}
    </Badge>
  )
}
