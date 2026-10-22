import { DesignTag } from '@/components/design/DesignTag'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'

interface DashboardActivityRailBadgeProps {
  label: string
}

export function DashboardActivityRailBadge({ label }: DashboardActivityRailBadgeProps) {
  return <DesignTag icon={<ArkadeIcon className="size-4" />}>{label}</DesignTag>
}
