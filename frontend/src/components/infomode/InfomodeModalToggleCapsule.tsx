import { InfomodeToggle } from '@/components/infomode/InfomodeToggle'
import { cn } from '@/lib/utils'

export const INFOMODE_MODAL_TOGGLE_TITLE =
  'Turn on Infomode to tap underlined labels for explanations'

interface InfomodeModalToggleCapsuleProps {
  className?: string
}

/**
 * Shared Infomode toggle styling for app modal headers (cyan-bordered capsule).
 */
export function InfomodeModalToggleCapsule({
  className,
}: InfomodeModalToggleCapsuleProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/[0.08] px-2.5 py-1.5 shadow-sm dark:bg-cyan-950/40',
        className,
      )}
      title={INFOMODE_MODAL_TOGGLE_TITLE}
    >
      <InfomodeToggle className="h-10 w-10 shadow-sm" />
    </div>
  )
}
