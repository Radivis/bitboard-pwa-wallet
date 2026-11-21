import { Link } from '@tanstack/react-router'
import { DesignButton } from '@/components/design/DesignButton'
import type { ManagementRailSection } from '@/lib/wallet/management-search'

const ADVANCED_ACTIONS_TEST_ID: Record<ManagementRailSection, string> = {
  arkade: 'dashboard-arkade-advanced-actions',
  bark: 'dashboard-bark-advanced-actions',
  lightning: 'dashboard-lightning-advanced-actions',
}

export function DashboardAdvancedActionsLink({ section }: { section: ManagementRailSection }) {
  return (
    <DesignButton appearance="tertiary" className="w-fit self-start" asChild>
      <Link
        to="/wallet/management"
        search={{ section }}
        data-testid={ADVANCED_ACTIONS_TEST_ID[section]}
      >
        Advanced actions
      </Link>
    </DesignButton>
  )
}
