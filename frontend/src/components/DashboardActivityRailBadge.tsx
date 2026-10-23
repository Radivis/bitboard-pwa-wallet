import type { ComponentType } from 'react'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'

interface DashboardActivityRailBadgeProps {
  label: string
  icon?: ComponentType<{ className?: string }>
}

export function DashboardActivityRailBadge({
  label,
  icon: Icon = ArkadeIcon,
}: DashboardActivityRailBadgeProps) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
