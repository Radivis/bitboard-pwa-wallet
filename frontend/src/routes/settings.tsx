import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: 'data-backups' } => {
    const sectionFromSearch = search.section
    if (sectionFromSearch === 'data-backups') return { section: 'data-backups' }
    return {}
  },
  beforeLoad: ({ location, search }) => {
    const sectionFromSearch = search.section
    if (sectionFromSearch !== 'data-backups') return
    const path = location.pathname
    if (path !== '/settings' && path !== '/settings/') return
    throw redirect({
      to: '/settings/security',
      search: { section: 'data-backups' },
    })
  },
  component: SettingsLayout,
})

function SettingsLayout() {
  return <Outlet />
}
