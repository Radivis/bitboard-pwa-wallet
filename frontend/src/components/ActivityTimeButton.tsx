import { useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'

import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

/** Relative time that switches to an absolute timestamp. The tap does not toggle the card. */
export function ActivityTimeButton({ unixSeconds }: { unixSeconds: number }) {
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false)
  const timestamp = new Date(unixSeconds * 1000)
  const label = showAbsoluteTime
    ? format(timestamp, 'yyyy-MM-dd HH:mm')
    : formatDistanceToNow(timestamp, { addSuffix: true })

  return (
    <button
      type="button"
      className={cn(designTypeClassName.metadata, 'text-[var(--design-text-subdued)]')}
      onClick={(event) => {
        event.stopPropagation()
        setShowAbsoluteTime((current) => !current)
      }}
    >
      {label}
    </button>
  )
}
