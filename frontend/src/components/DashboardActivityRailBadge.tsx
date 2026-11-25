import type { ComponentType } from 'react'
import { DesignTag } from '@/components/design/DesignTag'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'

interface DashboardActivityRailBadgeProps {
  label: string
  icon?: ComponentType<{ className?: string }>
}

export function DashboardActivityRailBadge({
  label,
  icon: Icon = ArkadeIcon,
}: DashboardActivityRailBadgeProps) {
  return <DesignTag icon={<Icon className="size-4" />}>{label}</DesignTag>
}
