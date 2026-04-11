import { Badge } from '@/components/ui/badge'

export function LabAddressTypeBadge({ addressType }: { addressType: string }) {
  const normalized = addressType.toLowerCase()
  if (normalized === 'taproot') {
    return (
      <span className="inline-flex items-center gap-1">
        <Badge variant="outline" className="font-normal">
          Taproot
        </Badge>
        <Badge variant="secondary" className="text-xs font-normal">
          experimental
        </Badge>
      </span>
    )
  }
  return (
    <Badge variant="secondary" className="font-normal">
      SegWit
    </Badge>
  )
}
