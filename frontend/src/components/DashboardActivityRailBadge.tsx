import { ArkadeIcon } from '@/components/icons/ArkadeIcon'

interface DashboardActivityRailBadgeProps {
  label: string
}

export function DashboardActivityRailBadge({ label }: DashboardActivityRailBadgeProps) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
      <ArkadeIcon className="h-3 w-3" />
      {label}
    </span>
  )
}
