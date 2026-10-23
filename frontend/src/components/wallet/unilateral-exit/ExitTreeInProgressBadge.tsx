import { Loader2, type LucideIcon } from 'lucide-react'

/** Spinning corner badge shared by the Arkade and Bark exit trees. */
export function ExitTreeInProgressBadge({
  icon: Icon,
  label,
  testId,
  iconName,
}: {
  icon: LucideIcon | null
  label?: string
  testId: string
  iconName?: string
}) {
  return (
    <div
      className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-background"
      data-testid={testId}
      data-icon={iconName}
      title={label}
      aria-label={label}
      aria-hidden={label == null}
    >
      <Loader2 className="absolute size-5 animate-spin text-blue-600" />
      {Icon != null && (
        <Icon className="relative z-10 size-2.5 text-blue-700" strokeWidth={2.5} />
      )}
    </div>
  )
}
