import { createFileRoute } from '@tanstack/react-router'
import { SettingsSecurityPage } from '@/pages/settings/SettingsSecurityPage'

export { SettingsSecurityPage } from '@/pages/settings/SettingsSecurityPage'

export const Route = createFileRoute('/settings/security')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: 'data-backups' } => {
    const raw = search.section
    if (raw === 'data-backups') return { section: 'data-backups' }
    return {}
  },
  component: SettingsSecurityPage,
})
