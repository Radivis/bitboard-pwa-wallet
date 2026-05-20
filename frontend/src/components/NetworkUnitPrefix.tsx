import { FlaskConical } from 'lucide-react'
import type { NetworkUnitIndicator } from '@/lib/bitcoin-display-unit'
import { cn } from '@/lib/utils'

type NetworkUnitPrefixProps = {
  indicator: NetworkUnitIndicator
  className?: string
}

export function NetworkUnitPrefix({ indicator, className }: NetworkUnitPrefixProps) {
  if (indicator === 'test') {
    return (
      <span className={cn('text-muted-foreground', className)} aria-hidden>
        t
      </span>
    )
  }
  if (indicator === 'lab') {
    return (
      <FlaskConical
        className={cn(
          'inline h-[0.85em] w-[0.85em] shrink-0 text-muted-foreground',
          className,
        )}
        aria-hidden
      />
    )
  }
  return null
}
